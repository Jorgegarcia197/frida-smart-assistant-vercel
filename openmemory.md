# Frida Smart Assistant — project index

## Overview

Next.js chat app with OpenAI-compatible AI SDK providers, Firestore chats, and agent MCP (SSE) via `@ai-sdk/mcp`.

## User Defined Namespaces

- (none defined)

## Patterns

### Chat message list virtualization (`components/virtualized-message-list.tsx`)

- Long threads render with `@tanstack/react-virtual` so only visible rows mount. The scroll element is `scrollRef` from `use-stick-to-bottom` (same as `Conversation` / `StickToBottom`), keeping auto-scroll behavior aligned. Rows use `measureElement` for variable height; `pb-6` between rows matches the previous flex `gap-6`.

### PDF uploads vs OpenAI-compatible chat (`lib/ai/expand-pdf-parts-for-model.ts`)

- User messages can include `file` parts with `application/pdf`, but many OpenAI-compatible gateways throw `AI_UnsupportedFunctionalityError` for PDF file parts.
- Before `convertToModelMessages`, `expandPdfFilePartsForModel` fetches the PDF URL, runs `pdf-parse` server-side, and replaces each PDF file part with a `text` part (truncated at 120k chars). Stored chat messages keep original parts for the UI.
- Import `pdf-parse/lib/pdf-parse.js` (not `pdf-parse`): the package root `index.js` runs a debug `readFileSync('./test/data/05-versions-space.pdf')` when `!module.parent`, which breaks under Next/Turbopack (`ENOENT`).

### OpenAI-compatible provider routing (`lib/ai/providers.ts`)

- Production provider now uses `createOpenAICompatible` with lazy initialization (`OPENAI_COMPATIBLE_API` / `LLM_API_BASE_URL` + `LLMOPS_API_KEY` / `LLM_API_KEY` / `OPENAI_API_KEY`).
- Logical model IDs are unchanged at call sites: `chat-model`, `chat-model-reasoning`, `title-model`, `artifact-model`, and `embeddings-model`.
- Per-role model overrides are supported via `CHAT_MODEL`, `REASONING_MODEL`, `TITLE_MODEL`, `ARTIFACT_MODEL`, and `EMBEDDING_MODEL`; all chat roles fall back to `LLM_MODEL_NAME`.
- Reasoning model still uses `extractReasoningMiddleware({ tagName: 'think' })` around the OpenAI-compatible language model.
- Embeddings route through the same provider (`textEmbeddingModel('embeddings-model')`), and `lib/embeddings/azure.ts` remains the single helper entrypoint with generic logging.

### Data stream → artifact routing (`components/data-stream-handler.tsx`)

- `onStreamPart` must use the artifact kind for the **current stream**, not `artifact.kind` from React state: a single `useEffect` tick can process many data parts while state is still stale (e.g. `data-codeDelta` was routed to the text artifact and ignored). Use a ref updated when handling `data-kind` (and sync from `artifact.kind` on change).

### Artifacts vs chat code (`lib/ai/prompts.ts` — `artifactsPrompt`)

- Models often streamed full ` ```python ` solutions in the assistant message (Streamdown in `components/elements/response.tsx`) while the code artifact stayed empty. Prompt now forbids duplicating the full listing in chat when using `createDocument` for code and requires the implementation to live in the artifact path.

### Reasoning model + artifacts (`lib/ai/prompts.ts`, `app/(chat)/api/chat/route.ts`)

- Default chat model is `chat-model-reasoning`. It must still receive `artifactsPrompt` and the same `activeTools` entries as `chat-model` (`createDocument`, `updateDocument`, `requestSuggestions`, `createMermaidDiagram`, `getWeather`, `updateAgentTasks`, `renderHostMap`, plus MCP tools). Otherwise the model cannot call `createDocument` and long documents appear as fenced ` ```html ` blocks in chat instead of the artifact panel.
- `streamText` uses `toolChoice: 'auto'` for every request (built-in tools are always registered). Previously, non-MCP chats used `toolChoice: undefined`, which could behave differently on some gateways.
- `reasoningEffort` for OpenAI-compatible is always `'medium'` when using `chat-model-reasoning`: high effort + tools had caused empty streams on some gateways, and high effort **without** MCP skewed toward reasoning + prose instead of artifact/diagram tool calls.
- For `chat-model-reasoning` only, system prompt adds a short **Reasoning + tools** section: planning/reasoning must not replace required `createDocument` / `createMermaidDiagram` / MCP tool calls.

### Mermaid sequence diagrams (`artifacts/mermaid/sanitize-mermaid-source.ts`)

- Models often split message labels across lines (e.g. `Client->>Auth: POST /login` then `(user, pass)` on the next line). Mermaid treats the second line as a new statement → parse errors on `,`. `sanitizeMermaidSource` merges continuations into the previous arrow line when the line has no arrow-before-colon and is not `alt`/`else`/`note`/etc. `artifacts/mermaid/server.ts` system prompt tells the artifact model to keep each sequence message on one line.

### Code artifact generation (`artifacts/code/server.ts`)

- Primary path: `streamObject` with `{ code: string }`. If the gateway breaks JSON/schema streaming (logs may show Python `NoneType` / `len` from LiteLLM or similar), the stream can finish with no `code` → empty artifact.
- Fallback: `streamText` + extract body from a ` ```python ` fence (or generic fence), then emit `data-codeDelta`. Log line: `[code artifact] streamObject produced no code… Trying streamText fallback.`

### Multiple `createDocument` calls (`lib/ai/prompts.ts`)

- No server-side cap: multi-file requests (e.g. FastAPI project) may use several `createDocument` calls in one turn with distinct titles. Prompt asks the model to avoid duplicate same-content artifacts for a single-file answer.

### Artifact display title vs generation prompt (`lib/ai/tools/create-document.ts`, `lib/artifacts/server.ts`)

- `createDocument` can send a concise `title` (for UI labels) plus a long `prompt` (for generation instructions). The artifact handlers now persist `displayTitle` to DB while still using `title` as the generation input, preventing minimized document cards from showing the full prompt text as the title.

### Assistant text + json-render layout (`components/json-render/assistant-message-content.tsx`)

- The assistant UI wrapper in `message.tsx` used `flex-row`. `AssistantMessageContent` previously returned a **Fragment** with text + spec, so React flattened two siblings under that row → **two columns** (text | charts). Fix: wrap text and `GenerativeUIRenderer` in a single `flex flex-col` container. Generative panel uses `max-w-full` so charts match the message column width.

### json-render generative UI (inline)

- Catalog: `lib/json-render/generative-ui-catalog.ts` (shadcn Card/Stack/Heading/Text + custom `Chart` for Recharts + `Map` for Leaflet).
- Renderer + registry: `components/json-render/generative-ui-renderer.tsx`; chart implementation: `components/json-render/json-render-chart.tsx`; map implementation: `components/json-render/json-render-map.tsx`.
- Chat API: `pipeJsonRender(result.toUIMessageStream(...))` in `app/(chat)/api/chat/route.ts` (no `smoothStream` — it breaks JSONL patches).
- System prompt appends `generativeUiCatalog.prompt({ mode: 'inline', ... })` in `lib/ai/prompts.ts`.
- Client: `useJsonRenderMessage` + `GenerativeUIRenderer` (`JSONUIProvider` + `Renderer`) in `components/json-render/assistant-message-content.tsx`; `data-spec` parts typed via `CustomUIDataTypes.spec` in `lib/types.ts`.
- shadcn `Chart` primitives: `components/ui/chart.tsx`.
- shadcn `Map` primitives: `components/ui/map.tsx` (Leaflet + react-leaflet, installed via `@shadcn-map/map`).
- **Tailwind:** do not add `node_modules/@json-render/shadcn` to `content` — the package includes Tailwind v4-only utilities that break Tailwind 3 (`var(--spacing(...))`). Use `safelist` in `tailwind.config.ts` for classes only emitted by json-render shadcn at runtime.

### renderHostMap tool (`lib/ai/tools/render-host-map.ts`)

- Built-in AI SDK `tool` for rendering interactive maps showing host/server locations in chat.
- Input schema: `{ title: string, hosts: [{ host, location, state?, country?, lat, lng }] }`. Output echoes the validated payload with `markerCount`.
- Registered in `toolsForModel` + `activeTools` in `app/(chat)/api/chat/route.ts`, exported from `lib/ai/tools/index.ts`, typed in `lib/ai/types.ts` (`ChatTools.renderHostMap`).
- Prompt rules in `lib/ai/prompts.ts` instruct the model to call `renderHostMap` when the user asks for a map, then emit JSONL `Map` patches via json-render with markers matching the tool output. Model approximates lat/lng from city/state knowledge when exact coords are unavailable.
- Message UI in `components/message.tsx` renders `tool-renderHostMap` parts as collapsible Tool cards showing input/output.

### Agent Builder HTTP tools (`lib/ai/tools/agent-custom-api-tools.ts`)

- Agent `tools` from Frida Agent Builder (type `api`) are sent as `agentTools` on `/api/chat` and persisted on the chat doc (`agentTools`) like `agentMcpConfig`.
- `getMcpToolsForAI` builds AI SDK `dynamicTool` entries: GET/POST from `config.url`, `queryParams` / `bodyParams`, optional `authType: bearer` + `apiKey`; `{query}` in param values is replaced by the model’s `query` argument when present.
- Logs use `redactAgentToolsForLog` (API keys stripped).

### SSE MCP tool wrapping (`lib/mcp/ai-sdk-mcp-tools.ts`)

- `wrapMcpToolForBedrock` must keep the `inputSchema` from `@ai-sdk/mcp` `client.tools()` (MCP JSON Schema with required fields). Replacing it with a loose Zod preprocess that defaulted to `{}` let empty tool calls reach the server (e.g. missing `query` on `execute_query`).

### MCP env merge (`lib/mcp/merge-server-mcp-env.ts`)

- `MCP_SSE_URL` / `MCP_X_API_KEY` apply only when the agent omits `url` or `x-api-key`.
- DB headers (`x-db-url`, `x-db-host`, `x-db-user`, `x-db-pass`, `x-db-name`) are **passed through** by default so remote MCP servers receive credentials on tool calls.
- Set `MCP_STRIP_DB_HEADERS=true` only when DB is configured solely on the MCP container and headers must not be forwarded from the agent payload.

### AI Elements task + shimmer UI (`components/message.tsx`, `components/multimodal-input.tsx`)

- AI Elements are installed under `components/ai-elements/`; local compatibility re-exports are kept in `components/elements/{shimmer,attachments,task}.tsx` so app imports stay under `@/components/elements/*`.
- Composer and message attachment rows now use the AI Elements `Attachments` container while preserving existing `PreviewAttachment` behavior and test IDs (`attachments-preview`, `message-attachments`).
- Assistant loading state (`ThinkingMessage`) uses `Shimmer` instead of static text.
- A new tool `updateAgentTasks` (`lib/ai/tools/update-agent-tasks.ts`) is registered in chat route + `ChatTools` typing and rendered as AI Elements `Task` blocks in message parts (`tool-updateAgentTasks`), with prompt guidance in `lib/ai/prompts.ts`.

### Chain-of-thought + reasoning wiring

- Chat API (`app/(chat)/api/chat/route.ts`): for `chat-model-reasoning`, `providerOptions.openaiCompatible.reasoningEffort` is `high` without MCP tools and `medium` when agent MCP tools are present (high + tools was omitting output on some gateways).
- `components/elements/reasoning.tsx` now re-exports the AI Elements reasoning primitives from `components/ai-elements/reasoning.tsx` (instead of a separate local implementation), so `MessageReasoning` renders with the new component behavior.
- `components/elements/chain-of-thought.tsx` re-exports `components/ai-elements/chain-of-thought.tsx`, and `tool-updateAgentTasks` in `components/message.tsx` now renders as `ChainOfThought` + `ChainOfThoughtStep` timeline UI.
- Reasoning chat mode guidance in `lib/ai/prompts.ts` now explicitly asks the model to emit `<think>...</think>` sections for `chat-model-reasoning`, which is parsed by `extractReasoningMiddleware({ tagName: 'think' })` and streamed via `sendReasoning: true` in the chat API route.
