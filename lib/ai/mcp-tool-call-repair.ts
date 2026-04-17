import type { JSONSchema7 } from '@ai-sdk/provider';
import type { ModelMessage } from 'ai';
import { InvalidToolInputError } from 'ai';
import type { LanguageModelV3ToolCall } from '@ai-sdk/provider';
import type { ToolResultOutput } from '@ai-sdk/provider-utils';

/**
 * When the gateway streams tool `arguments` as only "{}" (common with Claude + tools on some
 * OpenAI-compatible backends), schema validation fails with InvalidToolInputError. The model
 * often still emits the real filter JSON in assistant/reasoning text — recover it here.
 *
 * CheckMK call shapes and filters come from the **agent system prompt** (one-shot instructions),
 * not from app-side heuristics.
 */
function extractBalancedJsonObjectFrom(
  text: string,
  startIdx: number,
): string | null {
  if (text[startIdx] !== '{') return null;
  let depth = 0;
  for (let i = startIdx; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        return text.slice(startIdx, i + 1);
      }
    }
  }
  return null;
}

function isJsonQueryObject(v: unknown): v is Record<string, unknown> {
  return !!(v && typeof v === 'object' && !Array.isArray(v) && 'op' in (v as object));
}

/**
 * Returns true for queries that carry a meaningful filter value — not just a bare state
 * clause like `{"op":"=","left":"state","right":"0"}`.
 *
 * Rules:
 *  - Compound `and`/`or` queries with ≥2 sub-expressions → always substantial.
 *  - Single-clause with a non-numeric, non-empty string `right` value → substantial.
 *  - Bare state filter (left === "state", right is a single digit) → NOT substantial.
 */
function isSubstantialJsonQuery(raw: string): boolean {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (
      (v.op === 'and' || v.op === 'or') &&
      Array.isArray(v.expr) &&
      v.expr.length >= 2
    ) {
      return true;
    }
    const left = String(v.left ?? '');
    const right = v.right;
    if (left === 'state') return false;
    if (typeof right === 'string' && right.length > 1 && !/^\d+$/.test(right)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Collects all balanced `{"op":…}` JSON objects in `text` and returns the best candidate.
 * Prefers substantial compound queries; skips bare state filters and template placeholders.
 */
export function extractMcpFilterJsonFromText(text: string): string | null {
  const seen = new Set<string>();
  const candidates: string[] = [];

  const TEMPLATE_PLACEHOLDER_RE = /<[A-Z][A-Z0-9_]*>/;

  const pushCandidate = (raw: string | null) => {
    if (!raw || seen.has(raw)) return;
    if (TEMPLATE_PLACEHOLDER_RE.test(raw)) return;
    try {
      const v = JSON.parse(raw) as unknown;
      if (isJsonQueryObject(v)) {
        seen.add(raw);
        candidates.push(raw);
      }
    } catch {
      /* skip */
    }
  };

  const needles = ['The query should be:', 'query should be:', '{"op":', '{"op" :'];
  for (const n of needles) {
    let from = 0;
    while (from < text.length) {
      const hit = text.indexOf(n, from);
      if (hit === -1) break;
      let idx = hit;
      if (!n.startsWith('{')) {
        idx = text.indexOf('{', hit);
      }
      if (idx !== -1) {
        pushCandidate(extractBalancedJsonObjectFrom(text, idx));
      }
      from = hit + 1;
    }
  }

  let search = 0;
  while (search < text.length) {
    const i = text.indexOf('{"op":', search);
    if (i === -1) break;
    pushCandidate(extractBalancedJsonObjectFrom(text, i));
    search = i + 1;
  }

  if (candidates.length === 0) return null;

  const substantial = candidates.filter(isSubstantialJsonQuery);
  const pool = substantial.length > 0 ? substantial : candidates;

  let best = pool[0];
  if (best === undefined) return null;

  for (const raw of pool) {
    if (raw.length > best.length) best = raw;
  }

  if (!isSubstantialJsonQuery(best)) {
    return null;
  }

  return best;
}

function stringifyToolResultOutput(output: ToolResultOutput): string {
  switch (output.type) {
    case 'text':
      return output.value;
    case 'json':
      return JSON.stringify(output.value);
    case 'error-text':
      return output.value;
    case 'error-json':
      return JSON.stringify(output.value);
    case 'content':
      return output.value
        .map((p) => (p.type === 'text' && 'text' in p ? p.text : JSON.stringify(p)))
        .join('\n');
    case 'execution-denied':
      return output.reason ?? '';
    default:
      return '';
  }
}

/** Index of the most recent user message (prefer text after this for repair context). */
function indexOfLastUserMessage(messages: ModelMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') return i;
  }
  return -1;
}

function modelMessagesToSearchText(messages: ModelMessage[]): string {
  const out: string[] = [];
  for (const m of messages) {
    if (m.role === 'system') continue;
    if (m.role === 'tool') {
      const { content } = m;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part.type === 'tool-result') {
          out.push(stringifyToolResultOutput(part.output));
        }
      }
      continue;
    }
    const { content } = m;
    if (typeof content === 'string') {
      out.push(content);
      continue;
    }
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part.type === 'text' && 'text' in part && typeof part.text === 'string') {
        out.push(part.text);
      }
      if (part.type === 'reasoning' && 'text' in part && typeof part.text === 'string') {
        out.push(part.text);
      }
      if (part.type === 'tool-call' && 'toolName' in part) {
        try {
          out.push(
            `tool-call ${String(part.toolName)} ${JSON.stringify('input' in part ? part.input : {})}`,
          );
        } catch {
          /* ignore */
        }
      }
    }
  }
  return out.join('\n');
}

/** Prefer a real table for Northwind-style describe_table when the model streamed `{}`. */
function extractTableIdentifier(blob: string): string | null {
  const quoted = /"(public\.[a-z0-9_]+)"/gi;
  const fromJson: string[] = [];
  for (;;) {
    const match = quoted.exec(blob);
    if (match === null) break;
    const g = match[1];
    if (g) fromJson.push(g);
  }

  const skip = new Set(['public.table_name']);
  const candidates = [...new Set(fromJson)].filter((t) => !skip.has(t));
  if (candidates.length > 0) {
    const priority = [
      'public.order_details',
      'public.orders',
      'public.customers',
      'public.products',
    ];
    for (const p of priority) {
      if (candidates.includes(p)) return p;
    }
    return candidates[0] ?? null;
  }

  const paren =
    /describe_table\s*\(\s*`?(public\.[a-z0-9_]+|[a-z0-9_]+)`?\s*\)/i.exec(blob);
  if (paren?.[1]) {
    const id = paren[1];
    return id.includes('.') ? id : `public.${id}`;
  }

  const backtick = /`((public\.)?[a-z0-9_]+\.[a-z0-9_]+)`/i.exec(blob);
  if (backtick?.[1]) {
    const id = backtick[1];
    return id.startsWith('public.') ? id : `public.${id.replace(/^public\./, '')}`;
  }

  return null;
}

function pickPrimaryToolArgKey(schema: JSONSchema7): string | null {
  const props = schema.properties as Record<string, unknown> | undefined;
  if (!props || typeof props !== 'object') return null;
  const keys = Object.keys(props);
  if (keys.includes('jsonquery_string')) return 'jsonquery_string';
  if (keys.includes('query')) return 'query';
  if (keys.includes('table_name')) return 'table_name';
  if (keys.includes('table')) return 'table';
  const req = schema.required;
  if (Array.isArray(req) && req.length > 0 && keys.includes(req[0] as string)) {
    return req[0] as string;
  }
  return keys[0] ?? null;
}

export function createMcpToolCallRepair() {
  return async (options: {
    toolCall: LanguageModelV3ToolCall;
    messages: ModelMessage[];
    error: unknown;
    inputSchema: (o: { toolName: string }) => PromiseLike<JSONSchema7>;
  }): Promise<LanguageModelV3ToolCall | null> => {
    const { toolCall, messages, error, inputSchema } = options;
    if (!InvalidToolInputError.isInstance(error)) {
      return null;
    }

    const toolName = toolCall.toolName;

    const schema = await inputSchema({ toolName });
    const key = pickPrimaryToolArgKey(schema);
    if (!key) {
      return null;
    }

    const blob = modelMessagesToSearchText(messages);
    const lastUserIdx = indexOfLastUserMessage(messages);

    let repairedInput: Record<string, unknown> | null = null;

    const isCheckMkJsonQueryTool =
      /CheckMK/i.test(toolName) &&
      (key === 'query' || key === 'jsonquery_string');

    if (isCheckMkJsonQueryTool) {
      const blobSinceLastUser =
        lastUserIdx >= 0
          ? modelMessagesToSearchText(messages.slice(lastUserIdx))
          : blob;
      const filterJson =
        extractMcpFilterJsonFromText(blobSinceLastUser) ??
        extractMcpFilterJsonFromText(blob);
      if (!filterJson) {
        return null;
      }
      const props = schema.properties as Record<string, JSONSchema7> | undefined;
      const propSchema = props?.[key];
      let value: unknown = filterJson;
      if (propSchema?.type === 'object' || propSchema?.type === 'array') {
        try {
          value = JSON.parse(filterJson) as unknown;
        } catch {
          return null;
        }
      }
      repairedInput = { [key]: value };
    } else if (key === 'table_name' || key === 'table') {
      const tableId = extractTableIdentifier(blob);
      if (!tableId) {
        return null;
      }
      repairedInput = { [key]: tableId };
    } else {
      return null;
    }

    return {
      type: 'tool-call',
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: JSON.stringify(repairedInput),
      dynamic: toolCall.dynamic,
      providerExecuted: toolCall.providerExecuted,
      providerMetadata: toolCall.providerMetadata,
    };
  };
}
