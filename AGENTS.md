# Agent Instructions

## Core Commands
- `pnpm build`: Compile the SDK using `tsc`.
- `pnpm dev`: Run TypeScript in watch mode.

## Architecture & Usage
- **Purpose**: SDK for building Construct apps (MCP server helpers, types, dev tools).
- **Exports**:
  - `.` : Main entry point (`dist/index.js`).
  - `./construct-global`: Global ambient types (`src/construct-global.d.ts`).
  - `./schemas/manifest.schema.json`: JSON Schema for app manifests.
- **Stack**: TypeScript, Cloudflare Workers types.

## Notes
- Published to npm from tags.
- Part of the monorepo submodules.
