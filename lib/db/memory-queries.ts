import 'server-only';

import { db, dateToTimestamp, timestampToDate } from '../firebase';
import { stripUndefinedDeep } from './utils';
import { ChatSDKError } from '../errors';

/**
 * One memory entry attached to a conversation. Stored as a document in the
 * `chats/{chatId}/memory` subcollection. The doc id **is** the key so reads by
 * key are O(1) and listing is ordered by `updatedAt`.
 */
export interface ChatMemory {
  id: string;
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Firestore-safe doc id (no '/', '.', '..', '__*__' segments, bounded length). */
function toMemoryDocId(key: string): string {
  const trimmed = key.trim();
  if (trimmed.length === 0) {
    throw new ChatSDKError('bad_request:api', 'Memory key must be non-empty');
  }
  // Collapse disallowed characters but keep human-readable keys where possible.
  const sanitized = trimmed
    .replace(/\s+/g, '_')
    .replace(/[\/.]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 128);
  if (sanitized.length === 0) {
    throw new ChatSDKError('bad_request:api', 'Invalid memory key');
  }
  return sanitized;
}

function memoryCollection(chatId: string) {
  return db.collection('chats').doc(chatId).collection('memory');
}

export async function createMemory({
  chatId,
  key,
  value,
}: {
  chatId: string;
  key: string;
  value: string;
}): Promise<ChatMemory> {
  try {
    const id = toMemoryDocId(key);
    const now = new Date();
    const ref = memoryCollection(chatId).doc(id);

    const existing = await ref.get();
    if (existing.exists) {
      throw new ChatSDKError(
        'bad_request:api',
        `Memory key "${key}" already exists; use update.`,
      );
    }

    const record = stripUndefinedDeep({
      id,
      key,
      value,
      createdAt: dateToTimestamp(now),
      updatedAt: dateToTimestamp(now),
    });

    await ref.set(record);

    return {
      id,
      key,
      value,
      createdAt: now,
      updatedAt: now,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError('bad_request:database', 'Failed to create memory');
  }
}

export async function readMemory({
  chatId,
  key,
}: {
  chatId: string;
  key: string;
}): Promise<ChatMemory | null> {
  try {
    const id = toMemoryDocId(key);
    const snap = await memoryCollection(chatId).doc(id).get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data) return null;
    return {
      id,
      key: typeof data.key === 'string' ? data.key : id,
      value: typeof data.value === 'string' ? data.value : '',
      createdAt: timestampToDate(data.createdAt),
      updatedAt: timestampToDate(data.updatedAt),
    };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError('bad_request:database', 'Failed to read memory');
  }
}

export async function listMemories({
  chatId,
}: {
  chatId: string;
}): Promise<ChatMemory[]> {
  try {
    const snap = await memoryCollection(chatId)
      .orderBy('updatedAt', 'desc')
      .get();
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        key: typeof data.key === 'string' ? data.key : doc.id,
        value: typeof data.value === 'string' ? data.value : '',
        createdAt: timestampToDate(data.createdAt),
        updatedAt: timestampToDate(data.updatedAt),
      };
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to list memories');
  }
}

export async function updateMemory({
  chatId,
  key,
  value,
}: {
  chatId: string;
  key: string;
  value: string;
}): Promise<ChatMemory> {
  try {
    const id = toMemoryDocId(key);
    const ref = memoryCollection(chatId).doc(id);
    const existing = await ref.get();
    const now = new Date();

    if (!existing.exists) {
      const record = stripUndefinedDeep({
        id,
        key,
        value,
        createdAt: dateToTimestamp(now),
        updatedAt: dateToTimestamp(now),
      });
      await ref.set(record);
      return { id, key, value, createdAt: now, updatedAt: now };
    }

    const data = existing.data() ?? {};
    await ref.set(
      stripUndefinedDeep({
        value,
        updatedAt: dateToTimestamp(now),
      }),
      { merge: true },
    );

    return {
      id,
      key: typeof data.key === 'string' ? data.key : key,
      value,
      createdAt:
        data.createdAt != null ? timestampToDate(data.createdAt) : now,
      updatedAt: now,
    };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError('bad_request:database', 'Failed to update memory');
  }
}

export async function deleteMemory({
  chatId,
  key,
}: {
  chatId: string;
  key: string;
}): Promise<{ deleted: boolean }> {
  try {
    const id = toMemoryDocId(key);
    const ref = memoryCollection(chatId).doc(id);
    const existing = await ref.get();
    if (!existing.exists) return { deleted: false };
    await ref.delete();
    return { deleted: true };
  } catch (error) {
    if (error instanceof ChatSDKError) throw error;
    throw new ChatSDKError('bad_request:database', 'Failed to delete memory');
  }
}
