# Frida Smart Assistant — project index

## Overview

Next.js chat app with OpenAI-compatible AI SDK providers, Firestore chats, and agent MCP (SSE) via `@ai-sdk/mcp`.

## Future direction — multiple agents as subagents

- **Goal:** Allow loading **several** Frida Agent Builder agents into one conversation and exposing them to the **main** model as **tools** that delegate to **subagents** (each subagent with its own instructions, model choice, and tool set), per the AI SDK pattern: [Subagents](https://ai-sdk.dev/docs/agents/subagents#subagents).
- **Why:** Offload context-heavy work, isolate tool access per capability, and optionally stream subagent progress while summarizing back to the parent via `toModelOutput` so the main thread stays small.
- **Today:** One “current” agent per chat is merged into the request body and system prompt (`buildSystemPromptSections` in `lib/ai/prompts.ts`); Agent Builder configs come from `/api/agents/configs/by-deployment` and client context (`components/chat.tsx`, `components/load-agent-content.tsx`).
- **Later:** Model after `ToolLoopAgent` + `tool({ execute })` wrapping a nested agent; persist **multiple** agent bindings on the chat (ids + configs or refs); main system prompt describes when to call which subagent tool; consider `abortSignal` propagation and `convertToModelMessages` with `ignoreIncompleteToolCalls` for cancellation (as in the docs).

## User Defined Namespaces

- (none defined)

## Patterns

### Assistant markdown spacing (`components/elements/response.tsx`, `sanitizeText` in `lib/utils.ts`)

- `Response` wraps Streamdown with `prose prose-sm` plus optional `dark:prose-invert` (prop `proseInvertInDark`, default true). User chat bubbles use `proseInvertInDark={false}` and `text-primary-foreground` overrides because in dark theme `bg-primary` is a light chip while `dark:prose-invert` expects a dark surface—without the opt-out, user text was nearly invisible. Extra `[&_p]` / list margins for vertical rhythm as before.
- Reasoning / thinking UI (`components/ai-elements/reasoning.tsx`): expanded reasoning uses Streamdown with `prose prose-sm dark:prose-invert text-foreground` (not `text-muted-foreground` on the panel) so streamed thinking matches assistant markdown contrast on the dark canvas. `ReasoningTrigger` uses `text-foreground/80` instead of `text-muted-foreground`. `Shimmer` uses `--color-foreground` for its clipped gradient base so “Thinking…” stays readable while animating in dark mode.
- `sanitizeText` inserts a missing space after `.?!` when a letter/digit is immediately followed by punctuation and then an uppercase letter (`instructions.Now` → `instructions. Now`), and after `:` when a lowercase letter is immediately followed by `:` and an uppercase letter (`reportlab:Perfect` → `reportlab: Perfect`), mitigating glued tokens while stream deltas append to the same `text` part.

### MCP tool-call repair (`lib/ai/mcp-tool-call-repair.ts`)

- When the gateway streams `{}`, `experimental_repairToolCall` may recover args from message text. **CheckMK:** tools matching `/CheckMK/i` with schema `query` or `jsonquery_string` — collect all `{"op":…}` jsonquery blobs in text (current turn slice first, then full thread), pick the **longest** candidate (generic, not domain-tuned). **SQL MCP:** `table_name` / `table` extraction unchanged. CheckMK call shapes and filters are defined by the **agent system prompt**; `lib/ai/prompts.ts` adds a short reminder when any tool name matches CheckMK.
- **Per-request MCP dedupe** (`lib/mcp/ai-sdk-mcp-tools.ts` + `getMcpToolsForAI`): identical normalized tool input in one POST can return a cached MCP result.

### Chat message list virtualization (`components/virtualized-message-list.tsx`)

- Long threads render with `@tanstack/react-virtual` so only visible rows mount. The scroll element is `scrollRef` from `use-stick-to-bottom` (same as `Conversation` / `StickToBottom`), keeping auto-scroll behavior aligned. Rows use `measureElement` for variable height; `pb-6` between rows matches the previous flex `gap-6`.

### PDF uploads vs OpenAI-compatible chat (`lib/ai/expand-pdf-parts-for-model.ts`)

- User messages can include `file` parts with `application/pdf`, but many OpenAI-compatible gateways throw `AI_UnsupportedFunctionalityError` for PDF file parts.
- `extractPdfTextFromUrl(url)` fetches + `pdf-parse` and clamps to `MAX_PDF_TEXT_CHARS = 120_000`. `expandPdfFilePartsForModel` wraps it into text parts (PDF-only) and is kept for any callers that don't need office support.
- Import `pdf-parse/lib/pdf-parse.js` (not `pdf-parse`): the package root `index.js` runs a debug `readFileSync('./test/data/05-versions-space.pdf')` when `!module.parent`, which breaks under Next/Turbopack (`ENOENT`).

### Office (OOXML) uploads vs OpenAI-compatible chat (`lib/ai/expand-office-parts-for-model.ts`, `lib/ai/expand-file-parts-for-model.ts`)

- PPTX / DOCX / XLSX are **not** native multimodal document blocks on the Anthropic provider (AI SDK docs describe PDF only). Following the Claude Code model, we extract text server-side instead of forwarding the binary as a `file` part.
- `expand-office-parts-for-model.ts` exposes `extractOfficeTextFromUrl(url, mime)` with `MAX_OFFICE_TEXT_CHARS = 120_000`:
  - DOCX → `mammoth.extractRawText({ buffer })`.
  - XLSX → `XLSX.read + sheet_to_csv`, per-sheet header `## Sheet: <name>` with a 2,000-row cap per sheet.
  - PPTX → `JSZip.loadAsync` → walk `ppt/slides/slide*.xml` (ordered numerically) extracting `<a:t>` runs; speaker notes (`ppt/notesSlides/notesSlide*.xml`) are appended as `[Speaker notes]` blocks per slide.
- `expand-file-parts-for-model.ts` (`expandFilePartsForModel(messages)`) unifies PDF + OOXML in a single parts walk. Stored messages still use the original `file` parts; only the model-bound copy is transformed. Office text parts include an explicit disclaimer that layout, images, and embedded charts may be missing.
- Chat route (`app/(chat)/api/chat/route.ts`) calls the unified `expandFilePartsForModel` before `convertToModelMessages`. Upload allowlist (`app/(chat)/api/files/upload/route.ts`) and `postRequestBodySchema` (`app/(chat)/api/chat/schema.ts`) both accept the three OOXML MIME types in addition to PDF + image. The composer's hidden `<input type="file">` `accept` attribute in `components/multimodal-input.tsx` advertises `.pptx/.docx/.xlsx` so the OS picker surfaces them.
- `components/preview-attachment.tsx` now renders non-image attachments with an uppercased extension badge (PPTX, DOCX, XLSX, PDF, …) instead of the literal "File" placeholder.

### OpenAI-compatible provider routing (`lib/ai/providers.ts`)

- Production provider now uses `createOpenAICompatible` with lazy initialization (`OPENAI_COMPATIBLE_API` / `LLM_API_BASE_URL` + `LLMOPS_API_KEY` / `LLM_API_KEY` / `OPENAI_API_KEY`).
- Logical model IDs are unchanged at call sites: `chat-model`, `chat-model-reasoning`, `title-model`, `artifact-model`, and `embeddings-model`.
- Per-role model overrides are supported via `CHAT_MODEL`, `REASONING_MODEL`, `TITLE_MODEL`, `ARTIFACT_MODEL`, and `EMBEDDING_MODEL`; all chat roles fall back to `LLM_MODEL_NAME`.
- Reasoning model still uses `extractReasoningMiddleware({ tagName: 'think' })` around the OpenAI-compatible language model.
- Embeddings route through the same provider (`textEmbeddingModel('embeddings-model')`), and `lib/embeddings/azure.ts` remains the single helper entrypoint with generic logging.

### System prompt assembly (`lib/ai/prompts.ts`, `app/(chat)/api/chat/route.ts`)

- `systemPrompt(input)` is now a thin wrapper around `buildSystemPromptSections(input)` + `joinSystemPromptSections(sections)`. Each section is `{ id, kind: 'static' | 'dynamic', content }`. String output is byte-identical to the previous single-template implementation; existing callers keep working.
- Ordered sections: `base` (static), `responsibilities`, `knowledgeBase`, `mcpTools`, `anthropicSkills`, `nativeFileMode`, `desktopComputerUse` (all dynamic), `tasks` (static), `generativeUi` (static), `reasoningModel` (dynamic), `requestInfo` (dynamic — geo hints), `artifacts` (static, omitted in native-file strict mode).
- `joinSystemPromptSections(sections, { includeBoundary: true })` inserts the literal `SYSTEM_PROMPT_DYNAMIC_BOUNDARY` marker between the trailing static run and the first dynamic section. Default join **omits** the marker because it is a processing hint and must not reach the model on providers that do not strip it.
- `buildEffectiveSystemPrompt({ overrideSystemPrompt, appendSystemPrompt, build })` centralizes precedence (override replaces everything; append concatenates with `\n\n`). The chat route reads `SYSTEM_PROMPT_OVERRIDE` / `SYSTEM_PROMPT_APPEND` env vars so overrides are testable without code changes.
- `dumpSystemPrompt(sections)` renders a per-section diagnostic (id, kind, char count, preview) with light secret redaction (`Bearer …`, `sk-…`, `api_key|secret|token|password = …`). Gated in the chat route behind `DEBUG_SYSTEM_PROMPT=true`; the previous per-fragment `console.log('🔧 …')` calls were removed from `prompts.ts`.

### Native file generation — avoid duplicate exports (`lib/ai/prompts.ts`)

- When `anthropicSkillsEnabled` is true, `systemPrompt` includes a **single successful output** rule: for one user-requested PDF/PPTX/DOCX/XLSX deliverable, stop after the first successful file in tool results — do not re-run bash/code execution to save the same content under `1.pptx`/`2.pptx`/renamed copies. `forceNativeFileSkills` adds a short echo: no duplicate re-execution after success. This targets token waste from redundant tool loops (UI dedupe alone does not help).

### Anthropic skills passthrough + file downloads (`app/(chat)/api/chat/route.ts`, `app/(chat)/api/files/*`)

- Claude model requests now default to `providerOptions.openaiCompatible.anthropicExtensions` with code execution enabled and default built-in skills (`pptx`, `docx`, `pdf`, `xlsx`) unless overridden by env vars.
- `systemPrompt` now receives Anthropic skills context (`anthropicSkillsEnabled`, `anthropicSkills`) and explicitly prioritizes native file-skill generation for PDF/PPTX/DOCX/XLSX requests over artifact fallbacks.
- File proxy routes expose metadata/content from the compatible backend via authenticated app endpoints: `/api/files/{fileId}` and `/api/files/{fileId}/content`.
- `message.tsx` `splitDynamicToolDisplayName`: model tool ids with `server__tool` (from `collectAiSdkMcpTools`) show as **MCP** (`MCP · {server}` badge, Server icon); ids without `__` (agent custom HTTP tools from `lib/ai/tools/agent-custom-api-tools.ts`) show as **API** (`API` badge, Plug icon). Titles use neutral “Tool … completed” / “Calling MCP|API tool …”. **Important:** `sanitizeModelToolName` in `app/(chat)/api/chat/route.ts` must sanitize each segment of `server__tool` separately so `__` is not collapsed to `_` (otherwise MCP tools look like `northwindmcp_execute_query` and were mislabeled as API). Legacy persisted names matching `^(.+mcp)_(.+)$` are still treated as MCP for old threads.
- Tool-result UI (`components/tool-card.tsx`, export `ToolCard`) extracts `file_ids`/`file_id`, fetches metadata for friendly names/mime types, and renders download links through `/api/files/{fileId}/content`. The subtitle under each link uses `getGeneratedFileTypeSubtitle` (`lib/generated-file-label.ts`) so Office files show labels like “PowerPoint presentation” instead of raw `application/zip`. Non-delegated MCP cards include a collapsible **Tool parameters (JSON)** section showing the tool `input` (including `{}` when the model sends an empty object). `message.tsx` passes `part.input` for `dynamic-tool` in both in-flight and completed/error states. For **Anthropic code execution** tools (`text_editor_code_execution`, `bash_code_execution`, `code_execution`), `anthropicDelegated` hides the MCP `Card` and uses **ai-elements `Task`** (`TaskTrigger` / `TaskContent` / `TaskItem` / `TaskItemFile` from `components/ai-elements/task.tsx`): loading shows an in-progress task; errors show a failed task; success lists each file with optional image preview and a `TaskItemFile` chip linking to `/api/files/{id}/content`. In `message.tsx`, `isAnthropicDelegatedToolName` applies the same behavior to `dynamic-tool` parts (passthrough tools from `createAnthropicSkillsPassthroughTools`), not only literal `tool-*` part types.
- Remote MCP tools (`lib/mcp/ai-sdk-mcp-tools.ts` `collectAiSdkMcpTools`): `resolveTransportType` maps agent `mcpServers` entries to `sse` / `http` (AI SDK `createMCPClient` transport types) or `stdio` (legacy `MCPClient`). `transportType: 'streamable-http'` normalizes to `http`. Connection logs: `[AI SDK MCP] Connecting "<name>": transport=sse|http, url=…`. `wrapAiSdkMcpTool` logs each call: `[AI SDK MCP] call <modelToolName> input: …`, then `ok` / `error`. Inputs are validated with `safeValidateTypes` before MCP; if the MCP JSON Schema has `properties` but omits `required`/`minProperties`, `emptyPayloadViolatesInferredNonEmptyObject` (via `asSchema(…).jsonSchema`) blocks `{}`/all-empty values for any tool/agent—composite schemas (`allOf`/`$ref`/…) skip inference. Invalid calls log `blocked … (inferred non-empty args from JSON Schema, not calling MCP)`. `filterToLegacyMcpServers` strips sse/http so only stdio-style entries merge in `MCPClient`. Legacy `MCPClient` remote configs use `RemoteConfigSchema` (`sse` | `http`); streamable HTTP uses `StreamableHTTPClientTransport`. Chat route uses `collectAiSdkMcpTools` + `filterToLegacyMcpServers`. Tool ids use `sanitizeModelToolName`.
- Optional `DEBUG_CHAT_STREAM_CHUNKS=true` logs each `streamText` `onChunk` event in `app/(chat)/api/chat/route.ts` (model-layer chunks, not SSE wire format).
- Reasoning UI (`components/ai-elements/reasoning.tsx`) formats completed thinking duration as human-readable intervals (e.g. `3m 5s`, `1 hour`) instead of large second counts.
- For prompts that explicitly request native files (PDF/PPTX/DOCX/XLSX), chat route enables strict native-file mode: it passes `forceNativeFileSkills` to `systemPrompt`, omits artifact prompt rules for that turn, and removes artifact tools (`createDocument`, `updateDocument`, `requestSuggestions`, `createIshikawaDiagram`, `createMermaidDiagram`) from `toolsForModel`/`activeTools` to prevent fallback into artifact generation.
- The chat route still registers pass-through tools (`text_editor_code_execution`, `bash_code_execution`, `code_execution`) so the AI SDK accepts Anthropic tool calls; the compatible backend also injects those same tools. `lib/ai/providers.ts` `transformRequestBody` removes those three from the outgoing `tools` array when `providerOptions.openaiCompatible.anthropicExtensions` has code execution enabled, so Anthropic never sees duplicate tool names.

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

- `wrapAiSdkMcpTool` must keep the `inputSchema` from `@ai-sdk/mcp` `client.tools()` (MCP JSON Schema with required fields). Replacing it with a loose Zod preprocess that defaulted to `{}` let empty tool calls reach the server (e.g. missing `query` on `execute_query`).

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
