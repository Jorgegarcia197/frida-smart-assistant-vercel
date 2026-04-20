import type { ArtifactKind } from '@/components/artifact';
import type { SpecDataPart } from '@json-render/core';
import type { LanguageModelUsage, UIMessage } from 'ai';
import type { Suggestion } from './db/firebase-types';
import type { ChatTools } from './ai/types';

/** Emitted at `/api/chat` stream start; matches server log after expand + microcompact. */
export type ChatContextPayloadStreamData = {
  chatId: string;
  /** User message that started this `/api/chat` request (correlates stream chunks). */
  triggerMessageId: string;
  messageCount: number;
  partTypeHistogram: Record<string, number>;
  characterCount: number;
  approxInputTokens: number;
  microcompactEnabled: boolean;
  keepRecentMessages?: number;
  allowToolSubstrings?: string[];
};

type MessageMetadata = {
  createdAt: string;
  /**
   * Usage for this assistant turn (from stream `finish`). The context UI sums
   * output/reasoning across turns for session totals; input/cache reflect the
   * latest turn for the window meter.
   */
  usage?: LanguageModelUsage;
};

export type CustomUIDataTypes = {
  'mermaid-delta': string;
  'mermaid-type': string;
  'mermaid-description': string;
  textDelta: string;
  imageDelta: string;
  sheetDelta: string;
  codeDelta: string;
  suggestion: Suggestion;
  appendMessage: string;
  id: string;
  title: string;
  kind: ArtifactKind;
  clear: null;
  finish: null;
  /** json-render inline UI stream (part type `data-spec`) */
  spec: SpecDataPart;
  /** Server: context overflow retry trimmed older tool output (transient toast). */
  'context-trim-notice': string;
  /** Server: rough token estimate for the actual model payload this request (expand + microcompact). */
  'context-payload-estimate': ChatContextPayloadStreamData;
};

export type ChatMessage = UIMessage<
  MessageMetadata,
  CustomUIDataTypes,
  ChatTools
>;

export interface Attachment {
  name: string;
  url: string;
  contentType: string;
}
