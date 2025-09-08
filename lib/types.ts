import type { ArtifactKind } from '@/components/artifact';
import type { UIMessage } from 'ai';
import type { Suggestion } from './db/firebase-types';
import type { ChatTools } from './ai/types';

type MessageMetadata = {
  createdAt: string;
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
