import type { JSONValue } from '@ai-sdk/provider';
import type { ToolExecutionOptions } from 'ai';
import { dynamicTool } from 'ai';
import { z } from 'zod';
import {
  isFridaNormalizedWebToolResult,
  normalizeAnthropicWebToolResult,
} from '@/lib/ai/normalize-anthropic-web-tool-result';
import { takeProviderWebToolResult } from '@/lib/ai/web-tool-result-capture';

/** Model-only keys on the tool `input` object; any other keys are treated as upstream payload. */
const WEB_TOOL_INPUT_KEYS = new Set(['query', 'url', 'type']);

function extractUpstreamWebPayload(args: unknown): unknown | undefined {
  if (args == null || typeof args !== 'object') return undefined;
  const o = args as Record<string, unknown>;
  if ('_result' in o && o._result !== undefined) {
    return o._result;
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (!WEB_TOOL_INPUT_KEYS.has(k)) {
      extra[k] = v;
    }
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
}

/**
 * True when Anthropic web_search / web_fetch should be registered for this
 * request (Claude-capable model + env not disabled).
 */
export function isAnthropicWebToolsEnabledForModel(
  resolvedModelId: string,
  selectedChatModel: string,
): boolean {
  if (process.env.ANTHROPIC_ENABLE_WEB_TOOLS === 'false') return false;
  const lower = resolvedModelId.toLowerCase();
  const isClaudeModel = lower.includes('claude');
  const isReasoningPreset = selectedChatModel === 'chat-model-reasoning';
  return isClaudeModel || isReasoningPreset;
}

/**
 * Passthrough tools for `createOpenAICompatible` — **same contract as**
 * `createAnthropicSkillsPassthroughTools` in the chat route: the compatible API
 * runs the real tool upstream; local `execute` only mirrors JSON for the AI SDK
 * (`delegated` + `args`, or captured provider output / `_result` / extras).
 *
 * Web tools are an exception: `execute` returns a **normalized** projection
 * (`summary` + `sources`, redacted blobs). `toModelOutput` sends **only** the
 * markdown `summary` string to the model so tokens stay small; the UI still
 * receives the full structured object from `execute`.
 *
 * Optional alias: some gateways emit `$BUILT_IN_WEB_SEARCH` instead of `web_search`.
 */
export function createAnthropicWebPassthroughTools() {
  const passthroughSchema = z.object({}).passthrough();

  const webToolToModelOutput = (options: {
    toolCallId: string;
    input: unknown;
    output: unknown;
  }) => {
    if (isFridaNormalizedWebToolResult(options.output)) {
      return { type: 'text' as const, value: options.output.summary };
    }
    return { type: 'json' as const, value: options.output as JSONValue };
  };

  const passthroughExecute =
    (toolName: string) =>
    async (args: unknown, options?: ToolExecutionOptions) => {
      const fromHttp = takeProviderWebToolResult(options?.toolCallId);
      const raw = fromHttp ?? extractUpstreamWebPayload(args);
      if (raw !== undefined) {
        return normalizeAnthropicWebToolResult(toolName, raw, args);
      }
      return {
        delegated: true,
        note: 'Handled by OpenAI-compatible / Anthropic web tools backend',
        args,
      };
    };

  return {
    web_search: dynamicTool({
      description: [
        'Search the live web (real search on the compatible API).',
        'Use for: latest news, “what’s new”, newest models/products, current facts after your knowledge cutoff, or any user request to “search online”, “look up”, or “find on the web”.',
        'Input: include a non-empty `query` string with your search terms.',
        'Do NOT use bash_code_execution or code_execution to simulate search (e.g. echo)—those do not browse the web.',
      ].join(' '),
      inputSchema: passthroughSchema,
      execute: passthroughExecute('web_search'),
      toModelOutput: webToolToModelOutput,
    }),
    web_fetch: dynamicTool({
      description: [
        'Fetch and read a specific URL (real fetch on the compatible API).',
        'Use when the user pasted a link or you need the content of a known page/document.',
        'Input: include a non-empty `url` string.',
        'Do NOT use bash curl/wget simulation unless the user explicitly asked for a shell workflow; prefer this tool for reading web pages.',
      ].join(' '),
      inputSchema: passthroughSchema,
      execute: passthroughExecute('web_fetch'),
      toModelOutput: webToolToModelOutput,
    }),
    $BUILT_IN_WEB_SEARCH: dynamicTool({
      description: [
        'Same as `web_search` (gateway alias): search the live web.',
        'Prefer this or `web_search` over bash/code execution when the user wants online search.',
      ].join(' '),
      inputSchema: passthroughSchema,
      execute: passthroughExecute('$BUILT_IN_WEB_SEARCH'),
      toModelOutput: webToolToModelOutput,
    }),
  } as const;
}
