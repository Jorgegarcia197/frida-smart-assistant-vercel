import type { ChatMessage } from '@/lib/types';

const DEFAULT_CLEAR =
  '[cleared for context — call the tool again if you need the full output]';

export type TrimUiMessagesPreset = 'microcompact' | 'overflow-retry';

export type TrimUiMessagesForModelOptions = {
  preset: TrimUiMessagesPreset;
  /** Only for `microcompact`: keep this many tail messages fully intact. */
  keepRecentMessages?: number;
  /** Substrings matched against tool name (case-insensitive). CSV env drives defaults at call site. */
  allowToolSubstrings?: string[];
};

function toolNameFromPart(part: ChatMessage['parts'][number]): string | null {
  const t = part.type;
  if (t === 'dynamic-tool' && 'toolName' in part && typeof part.toolName === 'string') {
    return part.toolName;
  }
  if (typeof t === 'string' && t.startsWith('tool-')) {
    return t.slice('tool-'.length);
  }
  return null;
}

function shouldStubToolName(
  name: string,
  substrings: string[],
  preset: TrimUiMessagesPreset,
): boolean {
  if (preset === 'overflow-retry') return true;
  const lower = name.toLowerCase();
  return substrings.some((s) => lower.includes(s.toLowerCase()));
}

function clonePartWithClearedOutput(part: ChatMessage['parts'][number]): ChatMessage['parts'][number] {
  const stub = DEFAULT_CLEAR;
  if (
    'state' in part &&
    part.state === 'output-available' &&
    'output' in part
  ) {
    return { ...part, output: stub } as ChatMessage['parts'][number];
  }
  return part;
}

/**
 * Returns a **deep-cloned** message list for one model request. DB/UI storage
 * should keep the untrimmed `uiMessages` from the chat route.
 */
export function trimUiMessagesForModel(
  messages: ChatMessage[],
  options: TrimUiMessagesForModelOptions,
): ChatMessage[] {
  const keepRecent = Math.max(
    1,
    options.keepRecentMessages ??
      (options.preset === 'overflow-retry' ? 6 : 24),
  );
  const allowSubs =
    options.allowToolSubstrings ??
    (options.preset === 'microcompact'
      ? [
          'knowledge_base_search',
          'read_file',
          'grep',
          'glob',
          'list_dir',
          'list_files',
          'file_search',
          'codebase_search',
          'fetch',
          'web_search',
          'web_fetch',
        ]
      : []);

  const cloned = structuredClone(messages) as ChatMessage[];
  const headEnd = Math.max(0, cloned.length - keepRecent);

  for (let i = 0; i < headEnd; i++) {
    const msg = cloned[i];
    if (!msg?.parts?.length) continue;
    const newParts: ChatMessage['parts'] = [];
    for (const part of msg.parts) {
      const name = toolNameFromPart(part);
      if (
        name &&
        shouldStubToolName(name, allowSubs, options.preset) &&
        part.type !== 'reasoning'
      ) {
        newParts.push(clonePartWithClearedOutput(part));
      } else {
        newParts.push(part);
      }
    }
    cloned[i] = { ...msg, parts: newParts };
  }

  return cloned;
}
