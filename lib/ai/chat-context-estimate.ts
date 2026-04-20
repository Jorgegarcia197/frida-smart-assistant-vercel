import type { ChatMessage } from '@/lib/types';

export type ChatContextEstimate = {
  messageCount: number;
  partTypeHistogram: Record<string, number>;
  characterCount: number;
  /** Rough lower bound; not a tokenizer. */
  approxInputTokens: number;
};

function addPartChars(part: ChatMessage['parts'][number], into: number): number {
  if ('text' in part && typeof part.text === 'string') return into + part.text.length;
  if ('url' in part && typeof part.url === 'string') return into + part.url.length;
  if ('filename' in part && typeof part.filename === 'string')
    return into + part.filename.length;
  try {
    return into + JSON.stringify(part).length;
  } catch {
    return into;
  }
}

export function estimateChatContextFromUiMessages(
  messages: ChatMessage[],
): ChatContextEstimate {
  const partTypeHistogram: Record<string, number> = {};
  let characterCount = 0;
  for (const m of messages) {
    for (const p of m.parts) {
      partTypeHistogram[p.type] = (partTypeHistogram[p.type] ?? 0) + 1;
      characterCount = addPartChars(p, characterCount);
    }
  }
  return {
    messageCount: messages.length,
    partTypeHistogram,
    characterCount,
    approxInputTokens: Math.ceil(characterCount / 4),
  };
}
