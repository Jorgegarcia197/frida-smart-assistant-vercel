import type { ModelMessage } from 'ai';

function flattenUserContent(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((p) => {
      if (
        typeof p === 'object' &&
        p !== null &&
        'type' in p &&
        (p as { type: string }).type === 'text' &&
        'text' in p
      ) {
        return String((p as { text: string }).text);
      }
      return '';
    })
    .join('\n');
}

/** True if the latest user turn includes an explicit http(s) URL (fetch/search both allowed). */
export function lastUserMessageHasHttpUrl(
  messages: ReadonlyArray<ModelMessage>,
): boolean {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const text = flattenUserContent(m.content);
    return /\bhttps?:\/\//i.test(text);
  }
  return false;
}

function webToolOutputLooksSuccessful(output: unknown): boolean {
  if (output == null) return false;
  if (typeof output === 'object' && output !== null && 'error' in output) {
    return false;
  }
  if (
    typeof output === 'object' &&
    output !== null &&
    'delegated' in output &&
    (output as { delegated?: boolean }).delegated === true
  ) {
    return false;
  }
  return true;
}

type MinimalStep = {
  dynamicToolResults?: ReadonlyArray<{
    type?: string;
    toolName: string;
    output?: unknown;
  }>;
};

/**
 * After a successful `web_search` (or built-in alias), disable `web_fetch` for later steps —
 * and vice versa — so generic questions do not run search + fetch back-to-back.
 * Skipped when the user message contains `http(s)://` (explicit URLs).
 */
export function scanPriorWebToolSuccess(steps: ReadonlyArray<MinimalStep>): {
  searchSucceeded: boolean;
  fetchSucceeded: boolean;
} {
  let searchSucceeded = false;
  let fetchSucceeded = false;
  for (const step of steps) {
    for (const tr of step.dynamicToolResults ?? []) {
      if (tr.type && tr.type !== 'tool-result') continue;
      if (!webToolOutputLooksSuccessful(tr.output)) continue;
      if (tr.toolName === 'web_search' || tr.toolName === '$BUILT_IN_WEB_SEARCH') {
        searchSucceeded = true;
      }
      if (tr.toolName === 'web_fetch') {
        fetchSucceeded = true;
      }
    }
  }
  return { searchSucceeded, fetchSucceeded };
}

export function narrowActiveToolsAfterWebToolSuccess(options: {
  anthropicWebToolsEnabled: boolean;
  baseActiveTools: readonly string[];
  steps: ReadonlyArray<MinimalStep>;
  messages: ReadonlyArray<ModelMessage>;
}): { activeTools?: string[] } {
  if (!options.anthropicWebToolsEnabled) return {};
  if (lastUserMessageHasHttpUrl(options.messages)) return {};

  const { searchSucceeded, fetchSucceeded } = scanPriorWebToolSuccess(
    options.steps,
  );
  if (!searchSucceeded && !fetchSucceeded) return {};

  const next = options.baseActiveTools.filter((name) => {
    if (searchSucceeded && !fetchSucceeded && name === 'web_fetch') {
      return false;
    }
    if (fetchSucceeded && !searchSucceeded && name === 'web_search') {
      return false;
    }
    return true;
  });

  if (next.length === options.baseActiveTools.length) return {};
  return { activeTools: next };
}
