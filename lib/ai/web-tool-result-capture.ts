import { AsyncLocalStorage } from 'node:async_hooks';

/** Tool ids we mirror from the compatible API into local `execute` results. */
export const CAPTURED_WEB_TOOL_NAMES = new Set([
  'web_search',
  'web_fetch',
  '$BUILT_IN_WEB_SEARCH',
]);

type CaptureStore = Map<string, unknown>;

const webToolResultAls = new AsyncLocalStorage<CaptureStore>();

/**
 * Wraps one chat `streamText` / UI message generation so HTTP `fetch` can stash
 * provider tool outputs keyed by `tool_call_id` for the same request.
 */
export function runWithWebToolResultCapture<T>(
  fn: () => Promise<T>,
): Promise<T> {
  return webToolResultAls.run(new Map(), fn);
}

export function recordProviderWebToolResult(
  toolCallId: string,
  output: unknown,
): void {
  if (!toolCallId || output === undefined) return;
  const store = webToolResultAls.getStore();
  if (!store) return;
  store.set(toolCallId, output);
}

export function takeProviderWebToolResult(
  toolCallId: string | undefined,
): unknown | undefined {
  if (!toolCallId) return undefined;
  const store = webToolResultAls.getStore();
  if (!store) return undefined;
  if (!store.has(toolCallId)) return undefined;
  const v = store.get(toolCallId);
  store.delete(toolCallId);
  return v;
}

function tryRecordToolCallOutput(
  toolCallId: string | undefined,
  toolName: string | undefined,
  output: unknown,
): void {
  if (!toolCallId || output === undefined) return;
  if (!toolName || !CAPTURED_WEB_TOOL_NAMES.has(toolName)) return;
  recordProviderWebToolResult(toolCallId, output);
}

/** OpenAI-compatible gateways merge Anthropic server tool payloads under `arguments._result`. */
function tryResultFromFunctionArgumentsJson(fn: unknown): unknown {
  if (!fn || typeof fn !== 'object') return undefined;
  const raw = (fn as Record<string, unknown>).arguments;
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === 'object' && '_result' in parsed) {
      return parsed._result;
    }
  } catch {
    // incremental SSE fragments are not valid JSON until the gateway closes the string
  }
  return undefined;
}

function extractFromToolCallLike(obj: Record<string, unknown>): void {
  const id = typeof obj.id === 'string' ? obj.id : undefined;
  const fn = obj.function;
  const name =
    fn &&
    typeof fn === 'object' &&
    typeof (fn as Record<string, unknown>).name === 'string'
      ? ((fn as Record<string, unknown>).name as string)
      : typeof obj.name === 'string'
        ? obj.name
        : undefined;

  let output =
    obj.output ??
    obj.result ??
    obj.tool_result ??
    (fn && typeof fn === 'object'
      ? ((fn as Record<string, unknown>).output ??
        (fn as Record<string, unknown>).result)
      : undefined);

  if (output === undefined && fn && typeof fn === 'object') {
    output = tryResultFromFunctionArgumentsJson(fn);
  }

  if (id && name) {
    tryRecordToolCallOutput(id, name, output);
  }
}

/**
 * Streaming deltas often send `function.arguments` (with merged `_result`) on a **second**
 * chunk that has `index` but no `tool_call` `id`. Correlate via `index` from the first chunk.
 */
function ingestDeltaToolCallsWithIndex(
  json: unknown,
  indexToMeta: Map<number, { id: string; name: string }>,
): void {
  if (json == null || typeof json !== 'object') return;
  const root = json as Record<string, unknown>;
  const choices = root.choices;
  if (!Array.isArray(choices)) return;

  for (const ch of choices) {
    if (!ch || typeof ch !== 'object') continue;
    const delta = (ch as Record<string, unknown>).delta;
    if (!delta || typeof delta !== 'object') continue;
    const tcs = (delta as Record<string, unknown>).tool_calls;
    if (!Array.isArray(tcs)) continue;

    for (const raw of tcs) {
      if (!raw || typeof raw !== 'object') continue;
      const tc = raw as Record<string, unknown>;
      const idx = typeof tc.index === 'number' ? tc.index : 0;
      const fn = tc.function;
      const fnObj =
        fn && typeof fn === 'object' ? (fn as Record<string, unknown>) : undefined;

      if (typeof tc.id === 'string' && fnObj && typeof fnObj.name === 'string') {
        indexToMeta.set(idx, { id: tc.id, name: fnObj.name });
      }

      const merged = fnObj ? tryResultFromFunctionArgumentsJson(fnObj) : undefined;
      if (merged === undefined) continue;
      const meta = indexToMeta.get(idx);
      if (!meta) continue;
      tryRecordToolCallOutput(meta.id, meta.name, merged);
    }
  }
}

/**
 * Best-effort extraction of web tool outputs from OpenAI-compatible (or extended)
 * JSON bodies — some gateways embed `output` / `result` on `tool_calls` or send
 * parallel `tool_results` arrays.
 */
export function ingestOpenAiCompatibleJsonForWebTools(json: unknown): void {
  walkForWebToolOutputs(json, 0);
}

/** Non-streaming JSON responses: same as walk; also correlate indexed deltas when present. */
export function ingestOpenAiCompatibleJsonForWebToolsFull(
  json: unknown,
  indexToMeta: Map<number, { id: string; name: string }>,
): void {
  ingestOpenAiCompatibleJsonForWebTools(json);
  ingestDeltaToolCallsWithIndex(json, indexToMeta);
}

function walkForWebToolOutputs(node: unknown, depth: number): void {
  if (depth > 30 || node == null) return;
  if (typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) walkForWebToolOutputs(item, depth + 1);
    return;
  }

  const o = node as Record<string, unknown>;

  if (Array.isArray(o.tool_calls)) {
    for (const tc of o.tool_calls) {
      if (tc && typeof tc === 'object') {
        extractFromToolCallLike(tc as Record<string, unknown>);
      }
    }
  }

  if (Array.isArray(o.tool_results)) {
    for (const tr of o.tool_results) {
      if (!tr || typeof tr !== 'object') continue;
      const t = tr as Record<string, unknown>;
      const id =
        typeof t.tool_call_id === 'string'
          ? t.tool_call_id
          : typeof t.toolCallId === 'string'
            ? t.toolCallId
            : typeof t.id === 'string'
              ? t.id
              : undefined;
      const name =
        typeof t.name === 'string'
          ? t.name
          : t.function &&
              typeof t.function === 'object' &&
              typeof (t.function as Record<string, unknown>).name === 'string'
            ? ((t.function as Record<string, unknown>).name as string)
            : undefined;
      const output = t.output ?? t.content ?? t.result ?? t.message ?? t.text;
      tryRecordToolCallOutput(id, name, output);
    }
  }

  if (o.delta && typeof o.delta === 'object') {
    const d = o.delta as Record<string, unknown>;
    if (Array.isArray(d.tool_calls)) {
      for (const tc of d.tool_calls) {
        if (tc && typeof tc === 'object') {
          extractFromToolCallLike(tc as Record<string, unknown>);
        }
      }
    }
  }

  if (o.message && typeof o.message === 'object') {
    walkForWebToolOutputs(o.message, depth + 1);
  }

  for (const v of Object.values(o)) {
    walkForWebToolOutputs(v, depth + 1);
  }
}

/**
 * Tap SSE chunks synchronously as the consumer reads (no race with tool execute).
 */
export function createSseWebToolTapTransform(): TransformStream<
  Uint8Array,
  Uint8Array
> {
  let buffer = '';
  const decoder = new TextDecoder();
  /** Per HTTP response: map stream `index` → tool id/name from the first delta chunk. */
  const indexToMeta = new Map<number, { id: string; name: string }>();
  const ingestLine = (payload: string) => {
    if (payload === '[DONE]') return;
    try {
      const parsed = JSON.parse(payload) as unknown;
      ingestOpenAiCompatibleJsonForWebToolsFull(parsed, indexToMeta);
    } catch {
      // ignore non-JSON data lines
    }
  };
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
      buffer += decoder.decode(chunk, { stream: true });
      while (true) {
        const idx = buffer.indexOf('\n');
        if (idx < 0) break;
        const line = buffer.slice(0, idx).trimEnd();
        buffer = buffer.slice(idx + 1);
        if (!line.startsWith('data:')) continue;
        ingestLine(line.slice(5).trimStart());
      }
    },
    flush() {
      try {
        const rest = decoder.decode();
        if (rest) {
          buffer += rest;
          const line = buffer.trimEnd();
          if (line.startsWith('data:')) {
            const payload = line.slice(5).trimStart();
            if (payload && payload !== '[DONE]') {
              ingestLine(payload);
            }
          }
        }
      } catch {
        // ignore
      }
    },
  });
}
