import type { VisibilityType } from '@/components/visibility-selector';

// User collection document
export interface User {
  id: string;
  email: string;
  password?: string;
  createdAt: Date;
}

// Chat collection document
export interface Chat {
  id: string;
  createdAt: Date;
  title: string;
  userId: string;
  visibility: VisibilityType;
  // Agent data persisted with chat
  agentId?: string;
  agentSystemPrompt?: string;
  agentResponsibilities?: string[];
}

/** Legacy shape for persisted attachments (AI SDK v4-era). */
export interface LegacyAttachment {
  contentType: string;
  name: string;
  url: string;
}

// Message collection document (subcollection of Chat)
export interface DBMessage {
  id: string;
  chatId: string;
  role: string;
  parts: any;
  attachments: LegacyAttachment[];
  createdAt: Date;

  // There are some documents that reference experimental_attachments
  experimental_attachments?: LegacyAttachment[];
}

// Vote collection document (subcollection of Chat)
export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

// Document collection document
export type Document = {
  id: string; // uuid
  createdAt: Date; // timestamp
  title: string; // not null
  content: string | null; // nullable
  kind: 'text' | 'code' | 'image' | 'sheet' | 'mermaid'; // not null, default 'text'
  userId: string; // uuid
};

// Suggestion collection document (subcollection of Document)
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

// Stream collection document (subcollection of Chat)
export interface Stream {
  id: string;
  chatId: string;
  createdAt: Date;
}
