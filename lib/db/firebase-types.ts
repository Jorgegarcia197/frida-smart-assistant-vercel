import type { ArtifactKind } from '@/components/artifact';
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
}

// Message collection document (subcollection of Chat)
export interface DBMessage {
  id: string;
  chatId: string;
  role: string;
  parts: any;
  attachments: any;
  createdAt: Date;
}

// Vote collection document (subcollection of Chat)
export interface Vote {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
}

// Document collection document
export interface Document {
  id: string;
  createdAt: Date;
  title: string;
  content?: string;
  kind: ArtifactKind;
  userId: string;
}

// Suggestion collection document (subcollection of Document)
export interface Suggestion {
  id: string;
  documentId: string;
  documentCreatedAt: Date;
  originalText: string;
  suggestedText: string;
  description?: string;
  isResolved: boolean;
  userId: string;
  createdAt: Date;
}

// Stream collection document (subcollection of Chat)
export interface Stream {
  id: string;
  chatId: string;
  createdAt: Date;
} 