import type { DBMessage, LegacyAttachment } from '@/lib/db/firebase-types';
import type { UIMessage } from 'ai';

/** Convert a legacy v4-style attachment into a v5 `FileUIPart`.*/
const attachmentToFilePart = (
  attachment: LegacyAttachment,
): Extract<UIMessage['parts'][number], { type: 'file' }> => ({
  type: 'file',
  mediaType: attachment.contentType,
  url: attachment.url,
  filename: attachment.name,
});

/**
 * Convert a single DB-stored message into a v5 `UIMessage`.
 *
 * This function is part of the AI SDK v4 → v5 migration. In v5, the
 * `experimental_attachments`/`attachments` concept is removed in favor
 * of a single `parts` array.
 */
export function convertToUIMessage(message: DBMessage): UIMessage {
  const baseParts = (message.parts ?? []) as UIMessage['parts'];

  // v4 → v5: attachments -> file parts
  const legacyAttachments = (message.attachments ||
    message.experimental_attachments) as LegacyAttachment[] | undefined;
  const attachmentParts = (legacyAttachments ?? []).map(attachmentToFilePart);

  const parts: UIMessage['parts'] = [...baseParts, ...attachmentParts];

  return {
    id: message.id,
    parts,
    role: message.role as UIMessage['role'],
    // TODO: Checar si se debe agregar metadata?
  };
}

export function convertToUIMessages(messages: DBMessage[]): UIMessage[] {
  return messages.map((message) => convertToUIMessage(message));
}
