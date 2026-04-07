# Frida Smart Assistant — project index

## Overview

Next.js chat app with Bedrock, Firestore chats, and agent MCP (SSE) via `@ai-sdk/mcp`.

## User Defined Namespaces

- (none defined)

## Patterns

### json-render generative UI (inline)

- Catalog: `lib/json-render/generative-ui-catalog.ts` (shadcn Card/Stack/Heading/Text + custom `Chart` for Recharts).
- Renderer + registry: `components/json-render/generative-ui-renderer.tsx`; chart implementation: `components/json-render/json-render-chart.tsx`.
- Chat API: `pipeJsonRender(result.toUIMessageStream(...))` in `app/(chat)/api/chat/route.ts` (no `smoothStream` — it breaks JSONL patches).
- System prompt appends `generativeUiCatalog.prompt({ mode: 'inline', ... })` in `lib/ai/prompts.ts`.
- Client: `useJsonRenderMessage` + `GenerativeUIRenderer` (`JSONUIProvider` + `Renderer`) in `components/json-render/assistant-message-content.tsx`; `data-spec` parts typed via `CustomUIDataTypes.spec` in `lib/types.ts`.
- shadcn `Chart` primitives: `components/ui/chart.tsx`.
- **Tailwind:** do not add `node_modules/@json-render/shadcn` to `content` — the package includes Tailwind v4-only utilities that break Tailwind 3 (`var(--spacing(...))`). Use `safelist` in `tailwind.config.ts` for classes only emitted by json-render shadcn at runtime.

### MCP env merge (`lib/mcp/merge-server-mcp-env.ts`)

- `MCP_SSE_URL` / `MCP_X_API_KEY` apply only when the agent omits `url` or `x-api-key`.
- DB headers (`x-db-url`, `x-db-host`, `x-db-user`, `x-db-pass`, `x-db-name`) are **passed through** by default so remote MCP servers receive credentials on tool calls.
- Set `MCP_STRIP_DB_HEADERS=true` only when DB is configured solely on the MCP container and headers must not be forwarded from the agent payload.
