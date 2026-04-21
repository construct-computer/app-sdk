/**
 * ConstructApp — helper for building Construct MCP apps on Cloudflare Workers.
 *
 * Handles JSON-RPC 2.0 routing, tool registration, auth extraction,
 * and health check endpoints. Eliminates ~60 lines of boilerplate per app.
 *
 * @example
 * ```ts
 * import { ConstructApp } from '@construct-computer/app-sdk';
 *
 * const app = new ConstructApp({ name: 'my-app', version: '1.0.0' });
 *
 * app.tool('greet', {
 *   description: 'Say hello',
 *   parameters: { name: { type: 'string', description: 'Who to greet' } },
 *   handler: async (args) => `Hello, ${args.name}!`,
 * });
 *
 * export default app;
 * ```
 */

import { CONSTRUCT_SDK_CSS, CONSTRUCT_SDK_JS } from './client-sdk.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** A single content block in a tool result. */
export interface ContentBlock {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/** Full tool result (returned from handler or constructed automatically). */
export interface ToolResult {
  content: ContentBlock[];
  isError?: boolean;
}

/** Per-request context injected by the Construct platform. */
export interface RequestContext {
  /** User ID from the `x-construct-user` header. */
  userId?: string;

  /**
   * Credentials from the `x-construct-auth` header.
   * Shape depends on the auth scheme configured in manifest.json:
   *   - `oauth2`:  `{ type, access_token, refresh_token?, expires_at? }`
   *   - `api_key` | `bearer` | `basic`: `{ type, ...fields }`
   *     (field names come from `auth.schemes[].fields[].name` in the manifest)
   */
  auth?: {
    type: 'oauth2' | 'api_key' | 'bearer' | 'basic';
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    [key: string]: unknown;
  };

  /** Whether valid auth credentials are present. */
  isAuthenticated: boolean;

  /** The raw incoming request. */
  request: Request;

  /** Base64-encoded JSON of the app's environment variables from `x-construct-env`. */
  env: Record<string, string>;
}

/** JSON Schema definition for a tool parameter. */
export interface ParameterSchema {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: ParameterSchema;
  properties?: Record<string, ParameterSchema>;
  required?: string[];
  [key: string]: unknown;
}

/** Full tool definition with handler. */
export interface ToolDefinition {
  description: string;
  /** JSON Schema for the tool's parameters. Pass individual properties — they're wrapped in an object schema automatically. */
  parameters?: Record<string, ParameterSchema>;
  /** Raw JSON Schema (used as-is without wrapping). Takes precedence over `parameters`. */
  inputSchema?: Record<string, unknown>;
  /** Tool handler. Return a string for simple text results, or a ToolResult for complex content. */
  handler: (
    args: Record<string, unknown>,
    ctx: RequestContext,
  ) => Promise<string | ToolResult>;
}

export interface ConstructAppOptions {
  name: string;
  version: string;
}

// ── Internal types ───────────────────────────────────────────────────────────

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id?: string | number | null;
}

// ── Implementation ───────────────────────────────────────────────────────────

// Chromium's Private Network Access (PNA) blocks public pages (e.g.
// https://staging.construct.computer) from loading subresources out of
// the loopback/private address space unless the target server explicitly
// opts in with `Access-Control-Allow-Private-Network: true` on the CORS
// preflight. Without it, requests fail with:
//   "Permission was denied for this request to access the `loopback`
//    address space."
// Construct's desktop hosts dev apps on http://localhost:<port>, so the
// SDK must advertise PNA opt-in on every response (sandboxed-iframe
// script loads can produce `Origin: null`, which `*` already covers).
const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, HEAD, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, x-construct-user, x-construct-auth, x-construct-env',
  'Access-Control-Allow-Private-Network': 'true',
  // Max-age caches the preflight (incl. PNA opt-in) so scripts loaded
  // from the same origin don't pay the OPTIONS round-trip each time.
  'Access-Control-Max-Age': '86400',
};

export class ConstructApp {
  readonly name: string;
  readonly version: string;
  private tools = new Map<string, ToolDefinition>();

  constructor(options: ConstructAppOptions) {
    this.name = options.name;
    this.version = options.version;
  }

  /**
   * Register a tool on this app.
   *
   * @example Simple form
   * ```ts
   * app.tool('greet', {
   *   description: 'Say hello',
   *   parameters: { name: { type: 'string' } },
   *   handler: async (args) => `Hello, ${args.name}!`,
   * });
   * ```
   */
  tool(name: string, definition: ToolDefinition): this {
    this.tools.set(name, definition);
    return this;
  }

  // ── Cloudflare Worker export ─────────────────────────────────────────────

  /**
   * Cloudflare Worker `fetch` handler. Use as `export default app;`
   * (the runtime calls `.fetch` on the default export).
   *
   * Automatically handles:
   * - `/mcp` — MCP JSON-RPC endpoint
   * - `/health` — health check
   * - `/ui/*` path rewriting to `/*` (so dev matches published URL structure)
   * - Static asset serving via the Cloudflare `ASSETS` binding (if present)
   * - CORS headers on every response (required for Construct desktop dev mode)
   */
  async fetch(request: Request, env?: Record<string, unknown>): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    let response: Response;
    if (url.pathname === '/mcp' && request.method === 'POST') {
      response = await this.handleMcp(request);
    } else if (url.pathname === '/health') {
      response = new Response('ok');
    } else if (url.pathname === '/sdk/construct.js') {
      response = new Response(CONSTRUCT_SDK_JS, {
        headers: {
          'Content-Type': 'application/javascript; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } else if (url.pathname === '/sdk/construct.css') {
      response = new Response(CONSTRUCT_SDK_CSS, {
        headers: {
          'Content-Type': 'text/css; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    } else if (env?.ASSETS) {
      // Serve static UI assets via the Cloudflare ASSETS binding
      const assets = env.ASSETS as { fetch: typeof fetch };
      // Rewrite /ui/* → /* so dev matches the published URL structure
      if (url.pathname.startsWith('/ui/') || url.pathname === '/ui') {
        const rewritten = new URL(request.url);
        rewritten.pathname = url.pathname === '/ui' ? '/' : url.pathname.slice(3);
        response = await assets.fetch(new Request(rewritten, request));
      } else {
        response = await assets.fetch(request);
      }
    } else {
      response = new Response('Not found', { status: 404 });
    }

    // Apply CORS headers to every response so the dev-mode connect check
    // and browser-originated requests can read /health and /mcp.
    const headers = new Headers(response.headers);
    for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  // ── Deprecated ──────────────────────────────────────────────────────────

  /**
   * @deprecated Asset serving and CORS are now built into `fetch()` automatically.
   * Just use `export default app;` — this method is kept for backwards compatibility.
   */
  withAssets(): { fetch: (request: Request, env: Record<string, unknown>) => Promise<Response> } {
    return { fetch: (request: Request, env: Record<string, unknown>) => this.fetch(request, env) };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Build per-request context from headers. */
  private extractContext(request: Request): RequestContext {
    const ctx: RequestContext = { 
      isAuthenticated: false, 
      request, 
      env: {} 
    };

    const userId = request.headers.get('x-construct-user');
    if (userId) ctx.userId = userId;

    const authHeader = request.headers.get('x-construct-auth');
    if (authHeader) {
      try {
        const auth = JSON.parse(authHeader);
        ctx.auth = auth;
        // Authenticated if the platform delivered any credential payload.
        // For oauth2: access_token is required. For api_key/bearer/basic:
        // the platform guarantees at least one credential field when the
        // user has connected, so truthy `auth` is sufficient.
        ctx.isAuthenticated = !!auth && (auth.type !== 'oauth2' || !!auth.access_token);
      } catch {
        /* invalid auth header — leave isAuthenticated false */
      }
    }

    const envHeader = request.headers.get('x-construct-env');
    if (envHeader) {
      try {
        ctx.env = JSON.parse(atob(envHeader));
      } catch {
        /* invalid env header — leave env empty */
      }
    }

    return ctx;
  }

  /** Serialize registered tools for `tools/list`. */
  private getToolsList() {
    return Array.from(this.tools.entries()).map(([name, def]) => ({
      name,
      description: def.description,
      inputSchema: def.inputSchema ?? {
        type: 'object' as const,
        properties: def.parameters ?? {},
      },
    }));
  }

  /** Handle an incoming MCP JSON-RPC request. */
  private async handleMcp(request: Request): Promise<Response> {
    const ctx = this.extractContext(request);

    let rpc: JsonRpcRequest;
    try {
      rpc = (await request.json()) as JsonRpcRequest;
    } catch {
      return Response.json(
        { jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null },
      );
    }

    // Notifications (no id) → 204
    if (rpc.id === undefined || rpc.id === null) {
      return new Response(null, { status: 204 });
    }

    switch (rpc.method) {
      case 'initialize':
        return Response.json({
          jsonrpc: '2.0',
          id: rpc.id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: this.name, version: this.version },
          },
        });

      case 'tools/list':
        return Response.json({
          jsonrpc: '2.0',
          id: rpc.id,
          result: { tools: this.getToolsList() },
        });

      case 'tools/call':
        return this.handleToolCall(rpc, ctx);

      default:
        return Response.json({
          jsonrpc: '2.0',
          id: rpc.id,
          error: { code: -32601, message: `Unknown method: ${rpc.method}` },
        });
    }
  }

  /** Execute a tool call and return the JSON-RPC response. */
  private async handleToolCall(rpc: JsonRpcRequest, ctx: RequestContext): Promise<Response> {
    const params = rpc.params ?? {};
    const toolName = params.name as string;
    const toolArgs = (params.arguments ?? {}) as Record<string, unknown>;

    const tool = this.tools.get(toolName);
    if (!tool) {
      return Response.json({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          content: [{ type: 'text', text: `Unknown tool: ${toolName}. Available: ${[...this.tools.keys()].join(', ')}` }],
          isError: true,
        },
      });
    }

    try {
      const result = await tool.handler(toolArgs, ctx);

      const content: ContentBlock[] =
        typeof result === 'string'
          ? [{ type: 'text', text: result }]
          : result.content;

      const isError = typeof result === 'string' ? false : result.isError;

      return Response.json({
        jsonrpc: '2.0',
        id: rpc.id,
        result: { content, ...(isError && { isError }) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({
        jsonrpc: '2.0',
        id: rpc.id,
        result: {
          content: [{ type: 'text', text: `Error: ${message}` }],
          isError: true,
        },
      });
    }
  }
}

/**
 * Create a new Construct app.
 *
 * @example
 * ```ts
 * import { createApp } from '@construct-computer/app-sdk';
 * const app = createApp({ name: 'my-app', version: '1.0.0' });
 * ```
 */
export function createApp(options: ConstructAppOptions): ConstructApp {
  return new ConstructApp(options);
}

/**
 * Throw if the request is not authenticated.
 * Use in tool handlers that require OAuth.
 *
 * @example
 * ```ts
 * app.tool('my_tool', {
 *   handler: async (args, ctx) => {
 *     requireAuth(ctx);
 *     // ctx.auth is now guaranteed
 *   },
 * });
 * ```
 */
export function requireAuth(ctx: RequestContext): asserts ctx is RequestContext & { auth: NonNullable<RequestContext['auth']> } {
  if (!ctx.isAuthenticated || !ctx.auth) {
    throw new Error('Not authenticated. The user needs to connect their account first.');
  }
}
