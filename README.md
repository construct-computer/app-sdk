<div align="center">

[![npm](https://img.shields.io/npm/v/@construct-computer/app-sdk)](https://www.npmjs.com/package/@construct-computer/app-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

# @construct-computer/app-sdk

SDK for building [Construct](https://construct.computer) apps — MCP server helper, TypeScript types, and manifest validation.

## Quick Start

```bash
pnpm add @construct-computer/app-sdk
```

### Server (server.ts)

```typescript
import { ConstructApp } from '@construct-computer/app-sdk';

const app = new ConstructApp({ name: 'my-app', version: '1.0.0' });

app.tool('greet', {
  description: 'Say hello to someone',
  parameters: {
    name: { type: 'string', description: 'Who to greet' },
  },
  handler: async (args) => `Hello, ${args.name}!`,
});

// That's it — export as a Cloudflare Worker
export default app;
```

`export default app` handles everything automatically:

- `POST /mcp` — MCP JSON-RPC endpoint (tool calls, tool listing, initialization)
- `GET /health` — health check for the Construct desktop
- Static asset serving via the Cloudflare `ASSETS` binding (if configured in `wrangler.toml`)
- `/ui/*` path rewriting to `/*` (so dev matches the published URL structure)
- CORS headers on every response (required for Construct desktop dev mode)

### wrangler.toml

```toml
name = "my-construct-app"
main = "server.ts"
compatibility_date = "2024-12-01"

[assets]
directory = "./ui"
binding = "ASSETS"
not_found_handling = "none"
run_worker_first = ["/*"]
```

The `run_worker_first = ["/*"]` setting ensures all requests hit your server first, so `/mcp` and `/health` are handled by the SDK before falling through to static assets.

### UI (ui/index.html)

```html
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>My App</title>
    <link rel="stylesheet" href="https://registry.construct.computer/sdk/construct.css">
    <script src="https://registry.construct.computer/sdk/construct.js"></script>
</head>
<body>
    <h1>My App</h1>
    <button id="greet-btn">Greet</button>
    <div id="output"></div>
    <script src="app.js"></script>
</body>
</html>
```

The `construct.js` and `construct.css` script/link tags are required in your HTML. The Construct desktop strips them at load time and injects its own bridge that exposes the `construct.*` APIs.

### UI Types (ui/construct.d.ts)

Copy `src/construct-global.d.ts` into your `ui/` directory for full autocomplete in your UI code:

```javascript
/// <reference path="./construct.d.ts" />

construct.ready(() => {
  construct.ui.setTitle('My App');

  document.getElementById('greet-btn').addEventListener('click', async () => {
    const result = await construct.tools.callText('greet', { name: 'World' });
    document.getElementById('output').textContent = result;
  });
});
```

Pair with a `jsconfig.json` in `ui/` for VS Code autocomplete:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "checkJs": true
  }
}
```

### Manifest (manifest.json)

Add `$schema` for IDE validation:

```json
{
  "$schema": "https://raw.githubusercontent.com/construct-computer/app-sdk/main/schemas/manifest.schema.json",
  "name": "My App",
  "description": "What it does in one sentence.",
  "author": { "name": "Your Name" },
  "icon": "ui/icon.svg",
  "categories": ["utilities"],
  "tags": ["my-tag"],
  "ui": {
    "entry": "ui/index.html",
    "width": 480,
    "height": 600
  }
}
```

## App Structure

```
my-construct-app/
├── manifest.json       # App metadata (required)
├── server.ts           # MCP server entry point (required)
├── wrangler.toml       # Cloudflare Workers config
├── tsconfig.json       # TypeScript config (server)
├── package.json
├── ui/                 # Visual interface (optional — omit for tools-only apps)
│   ├── index.html      # UI entry point
│   ├── app.js          # UI logic
│   ├── construct.d.ts  # SDK type declarations (copy from app-sdk)
│   ├── jsconfig.json   # JS project config (enables autocomplete)
│   └── icon.svg        # App icon (256x256, PNG/SVG/JPG)
└── screenshots/        # Optional store screenshots
    └── 1.png
```

## API Reference

### `ConstructApp`

The main class. Handles JSON-RPC 2.0 routing, tool registration, auth extraction, asset serving, and CORS.

```typescript
import { ConstructApp } from '@construct-computer/app-sdk';

const app = new ConstructApp({ name: string, version: string });

// Register tools
app.tool('name', {
  description: 'What the AI sees when deciding whether to use this tool',
  parameters: {
    input: { type: 'string', description: 'The input value' },
    mode: { type: 'string', enum: ['a', 'b'], description: 'Operation mode' },
  },
  handler: async (args, ctx) => {
    // Return string for simple text results
    return 'result text';
    // Or return ToolResult for complex/error content
    return { content: [{ type: 'text', text: '...' }], isError: true };
  },
});

// Export as Cloudflare Worker — handles MCP, health, assets, and CORS
export default app;
```

You can also use the `createApp()` factory:

```typescript
import { createApp } from '@construct-computer/app-sdk';
const app = createApp({ name: 'my-app', version: '1.0.0' });
```

### `RequestContext`

Available in every tool handler as the second argument:

```typescript
interface RequestContext {
  userId?: string;           // From x-construct-user header
  auth?: {                   // From x-construct-auth header
    type: 'oauth2' | 'api_key' | 'bearer' | 'basic';
    access_token?: string;   // OAuth2
    refresh_token?: string;  // OAuth2
    expires_at?: number;     // OAuth2
    [key: string]: unknown;  // Dynamic fields from api_key/bearer/basic schemes
  };
  isAuthenticated: boolean;  // Whether valid credentials are present
  request: Request;          // Raw incoming request
  env: Record<string, string>; // App environment variables from x-construct-env
}
```

The `auth` shape depends on the scheme configured in your `manifest.json`:
- **`oauth2`**: `access_token`, `refresh_token`, `expires_at`
- **`api_key` / `bearer` / `basic`**: fields match the `name` values in your `auth.schemes[].fields[]` definition

### `requireAuth(ctx)`

Throws if the user hasn't connected their account. Use in tools that need authentication:

```typescript
import { requireAuth } from '@construct-computer/app-sdk';

app.tool('my_private_tool', {
  description: 'Needs auth',
  handler: async (args, ctx) => {
    requireAuth(ctx); // throws if not authenticated
    const res = await fetch('https://api.example.com', {
      headers: { Authorization: `Bearer ${ctx.auth!.access_token}` },
    });
    return await res.text();
  },
});
```

### Client-side SDK (`construct.*`)

The Construct platform injects these globals into every app iframe:

| API | Description |
|---|---|
| `construct.ready(callback)` | Run code when the SDK bridge is ready |
| `construct.tools.call(name, args)` | Call a tool, get the full result object |
| `construct.tools.callText(name, args)` | Call a tool, get just the text result |
| `construct.ui.setTitle(title)` | Update the window title bar |
| `construct.ui.getTheme()` | Get the current theme (`{ mode, accent }`) |
| `construct.ui.close()` | Close the app window |
| `construct.state.get()` | Read persistent app state |
| `construct.state.set(state)` | Write persistent app state |
| `construct.state.onUpdate(callback)` | Subscribe to state changes (from agent or other tabs) |
| `construct.agent.notify(message)` | Send a message to the AI agent |

CSS variables (`--c-bg`, `--c-surface`, `--c-text`, `--c-accent`, etc.) and utility classes are provided by `construct.css` for theme-aware styling.

### Authentication

Configure auth schemes in `manifest.json`. The SDK supports four types:

**OAuth2:**
```json
{
  "auth": {
    "schemes": [{
      "type": "oauth2",
      "authorization_url": "https://example.com/oauth/authorize",
      "token_url": "https://example.com/oauth/token",
      "scopes": ["read", "write"]
    }]
  }
}
```

**API Key / Bearer / Basic:**
```json
{
  "auth": {
    "schemes": [{
      "type": "api_key",
      "label": "Connect your API key",
      "instructions": "Get your API key from https://example.com/settings",
      "fields": [
        { "name": "api_key", "displayName": "API Key", "type": "password", "required": true }
      ]
    }]
  }
}
```

Credential values are delivered to your tool handlers via `ctx.auth`.

## Development

```bash
pnpm dev          # Start local dev server (wrangler dev)
```

Test your MCP endpoint:

```bash
# Health check
curl http://localhost:8787/health

# List tools
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"greet","arguments":{"name":"World"}}}'
```

### Testing in Construct

With the dev server running:

1. Open Construct > **Settings** > **Developer**
2. Toggle **Developer Mode** on
3. Under **Connect Dev Server**, paste `http://localhost:8787` and click **Connect**

Construct calls your server's `/health` and `/mcp` endpoints to register the app, and opens your UI in a sandboxed window.

## Publishing

1. Push your app to a public GitHub repository
2. Fork [construct-computer/app-registry](https://github.com/construct-computer/app-registry)
3. Add `apps/your-app-id.json`:
   ```json
   {
     "repo": "https://github.com/you/your-app",
     "versions": [
       { "version": "1.0.0", "commit": "<40-char SHA>", "date": "2026-04-16" }
     ]
   }
   ```
4. Open a PR — CI validates automatically
5. Once merged, your app appears in the Construct App Store

See the full guide at [registry.construct.computer/publish](https://registry.construct.computer/publish).

## Links

- [Construct Platform](https://construct.computer)
- [App Store](https://registry.construct.computer)
- [Publishing Guide](https://registry.construct.computer/publish)
- [Sample App (Text Tools)](https://github.com/construct-computer/construct-app-sample)
- [Scaffold a new app](https://www.npmjs.com/package/@construct-computer/create-construct-app)
