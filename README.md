<div align="center">

[![npm](https://img.shields.io/npm/v/@construct-computer/app-sdk)](https://www.npmjs.com/package/@construct-computer/app-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

# @construct-computer/app-sdk

SDK for building [Construct](https://construct.computer) apps — MCP server helper, TypeScript types, and manifest validation.

## Quick Start

```bash
npm install @construct-computer/app-sdk
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

// Export as Cloudflare Worker (this is all you need)
export default app;
```

### UI Types (ui/construct.d.ts)

Copy `src/construct-global.d.ts` into your `ui/` directory for full autocomplete:

```html
<script>
  construct.ready(() => {
    construct.ui.setTitle('My App');
  });

  async function runGreet() {
    const result = await construct.tools.callText('greet', { name: 'World' });
    document.getElementById('output').textContent = result;
  }
</script>
```

### Manifest (manifest.json)

Add `$schema` for IDE validation:

```json
{
  "$schema": "https://registry.construct.computer/schemas/manifest.json",
  "name": "My App",
  "description": "What it does in one sentence.",
  "author": { "name": "Your Name" },
  "icon": "icon.png",
  "categories": ["utilities"],
  "tags": ["my-tag"]
}
```

## API Reference

### `ConstructApp`

The main class. Handles JSON-RPC 2.0 routing, tool registration, and auth extraction.

```typescript
const app = new ConstructApp({ name: string, version: string });

// Register tools
app.tool('name', {
  description: 'What it does',
  parameters: { /* JSON Schema properties */ },
  handler: async (args, ctx) => {
    // Return string for simple results
    return 'result text';
    // Or return ToolResult for complex content
    return { content: [{ type: 'text', text: '...' }] };
  },
});

// Export as CF Worker
export default app;
```

### `RequestContext`

Available in every tool handler as the second argument:

```typescript
interface RequestContext {
  userId?: string;           // From x-construct-user header
  auth?: {                   // From x-construct-auth header (OAuth)
    access_token: string;
    user_id: string;
  };
  isAuthenticated: boolean;  // Whether auth is present
  request: Request;          // Raw request
}
```

### `requireAuth(ctx)`

Throws if the user hasn't connected their account. Use in tools that need OAuth:

```typescript
import { requireAuth } from '@construct-computer/app-sdk';

app.tool('my_private_tool', {
  description: 'Needs auth',
  handler: async (args, ctx) => {
    requireAuth(ctx); // throws if not authenticated
    const res = await fetch('https://api.example.com', {
      headers: { Authorization: `Bearer ${ctx.auth.access_token}` },
    });
    return await res.text();
  },
});
```

## App Structure

```
my-construct-app/
├── manifest.json       # App metadata (required)
├── server.ts           # MCP server entry point (required)
├── icon.png            # 256x256 app icon (required)
├── package.json        # Dependencies
├── wrangler.toml       # Cloudflare Workers config
├── README.md           # Documentation
├── ui/                 # Optional visual interface
│   ├── index.html      # UI entry point
│   └── construct.d.ts  # SDK type declarations
└── screenshots/        # Optional store screenshots
    ├── 1.png
    └── 2.png
```

## Development

```bash
npm run dev          # Start local dev server (wrangler dev)
```

Test your MCP endpoint:

```bash
curl -X POST http://localhost:8787/mcp \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'
```

## Publishing

1. Push your app to a public GitHub repository
2. Fork [construct-computer/app-registry](https://github.com/construct-computer/app-registry)
3. Add `apps/your-app-id.json`:
   ```json
   {
     "repo": "https://github.com/you/your-app",
     "description": "Short description for the registry.",
     "versions": [
       { "version": "1.0.0", "commit": "<40-char SHA>", "date": "2026-04-07" }
     ]
   }
   ```
4. Open a PR — CI validates automatically
5. Once merged, your app appears in the Construct App Store

## Links

- [Construct Platform](https://construct.computer)
- [App Store](https://registry.construct.computer)
- [Publishing Guide](https://registry.construct.computer/publish)
- [Sample App (DevTools)](https://github.com/construct-computer/construct-app-sample)
- [MercadoLibre App](https://github.com/construct-computer/construct-app-mercadolibre)
- [Scaffold a new app](https://www.npmjs.com/package/@construct-computer/create-construct-app)
