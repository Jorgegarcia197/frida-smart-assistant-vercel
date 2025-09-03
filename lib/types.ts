import { z } from 'zod';
import type { getWeather } from './ai/tools/get-weather';
import type { createMermaidDiagram } from './ai/tools/create-mermaid-diagram';
import type { createDocument } from './ai/tools/create-document';
import type { updateDocument } from './ai/tools/update-document';
import type { requestSuggestions } from './ai/tools/request-suggestions';
import type { InferUITool, UIMessage } from 'ai';

import type { ArtifactKind } from '@/components/artifact';

export type Suggestion = {
  id: string; // uuid
  documentId: string; // uuid
  documentCreatedAt: Date; // timestamp
  originalText: string;
  suggestedText: string;
  description: string | null; // nullable
  isResolved: boolean; // default false
  userId: string; // uuid
  createdAt: Date; // timestamp
};

export type Vote = {
  chatId: string; // uuid
  messageId: string; // uuid
  isUpvoted: boolean; // not null
};

export type Document = {
  id: string; // uuid
  createdAt: Date; // timestamp
  title: string; // not null
  content: string | null; // nullable
  kind: 'text' | 'code' | 'image' | 'sheet'; // not null, default 'text'
  userId: string; // uuid
};

export type DataPart = { type: 'append-message'; message: string };

export const messageMetadataSchema = z.object({
  createdAt: z.string(),
});

export type MessageMetadata = z.infer<typeof messageMetadataSchema>;

type weatherTool = InferUITool<typeof getWeather>;
type createDocumentTool = InferUITool<ReturnType<typeof createDocument>>;
type updateDocumentTool = InferUITool<ReturnType<typeof updateDocument>>;
type requestSuggestionsTool = InferUITool<
  ReturnType<typeof requestSuggestions>
>;
type createMermaidDiagramTool = InferUITool<
  ReturnType<typeof createMermaidDiagram>
>;

export type ChatTools = {
  getWeather: weatherTool;
  createDocument: createDocumentTool;
  updateDocument: updateDocumentTool;
  requestSuggestions: requestSuggestionsTool;
  createMermaidDiagram: createMermaidDiagramTool;
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
