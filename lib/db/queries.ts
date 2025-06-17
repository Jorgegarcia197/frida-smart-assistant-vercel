import 'server-only';

import { db, generateFirestoreId, timestampToDate, dateToTimestamp } from '../firebase';
import type { 
  User, 
  Chat, 
  DBMessage, 
  Vote, 
  Document, 
  Suggestion, 
  Stream 
} from './firebase-types';
import type { ArtifactKind } from '@/components/artifact';
import { generateUUID } from '../utils';
import { generateHashedPassword } from './utils';
import type { VisibilityType } from '@/components/visibility-selector';
import { ChatSDKError } from '../errors';

// User operations
export async function getUser(email: string): Promise<Array<User>> {
  try {
    const snapshot = await db.collection('users').where('email', '==', email).get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as User[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get user by email');
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);
  const id = generateFirestoreId();

  try {
    await db.collection('users').doc(id).set({
      email,
      password: hashedPassword,
      createdAt: dateToTimestamp(new Date())
    });
    return { id, email };
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create user');
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());
  const id = generateFirestoreId();

  try {
    await db.collection('users').doc(id).set({
      email,
      password,
      createdAt: dateToTimestamp(new Date())
    });
    return [{ id, email }];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create guest user');
  }
}

// Firebase Auth integrated functions
export async function createUserWithFirebaseAuth(email: string, password: string) {
  const { createFirebaseUser } = await import('../auth/firebase-auth');
  return await createFirebaseUser(email, password);
}

// Chat operations
export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    await db.collection('chats').doc(id).set({
      userId,
      title,
      visibility,
      createdAt: dateToTimestamp(new Date())
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save chat');
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    const batch = db.batch();
    
    // Delete votes subcollection
    const votesSnapshot = await db.collection('chats').doc(id).collection('votes').get();
    votesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete messages subcollection
    const messagesSnapshot = await db.collection('chats').doc(id).collection('messages').get();
    messagesSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete streams subcollection
    const streamsSnapshot = await db.collection('chats').doc(id).collection('streams').get();
    streamsSnapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    // Delete the chat document
    const chatRef = db.collection('chats').doc(id);
    batch.delete(chatRef);
    
    await batch.commit();
    
    return { id };
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete chat by id');
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    let query = db.collection('chats')
      .where('userId', '==', id)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (startingAfter) {
      const startDoc = await db.collection('chats').doc(startingAfter).get();
      if (!startDoc.exists) {
        throw new ChatSDKError('not_found:database', `Chat with id ${startingAfter} not found`);
      }
      query = query.startAfter(startDoc);
    } else if (endingBefore) {
      const endDoc = await db.collection('chats').doc(endingBefore).get();
      if (!endDoc.exists) {
        throw new ChatSDKError('not_found:database', `Chat with id ${endingBefore} not found`);
      }
      query = query.endBefore(endDoc);
    }

    const snapshot = await query.get();
    const chats = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as Chat[];

    const hasMore = chats.length > limit;
    return {
      chats: hasMore ? chats.slice(0, limit) : chats,
      hasMore,
    };
  } catch (error) {
    console.error('getChatsByUserId error:', error);
    throw new ChatSDKError('bad_request:database', 'Failed to get chats by user id');
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const doc = await db.collection('chats').doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data()!.createdAt)
    } as Chat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get chat by id');
  }
}

// Message operations
export async function saveMessages({
  messages,
}: {
  messages: Array<DBMessage>;
}) {
  try {
    const batch = db.batch();
    
    messages.forEach(message => {
      const messageRef = db.collection('chats').doc(message.chatId).collection('messages').doc(message.id);
      batch.set(messageRef, {
        ...message,
        createdAt: dateToTimestamp(message.createdAt)
      });
    });
    
    await batch.commit();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save messages');
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    const snapshot = await db.collection('chats').doc(id).collection('messages')
      .orderBy('createdAt', 'asc')
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as DBMessage[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get messages by chat id');
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    // Since messages are subcollections, we need to search across all chats
    // This is not efficient - in a real app, you'd store chatId with the message query
    const chatsSnapshot = await db.collection('chats').get();
    
    for (const chatDoc of chatsSnapshot.docs) {
      const messageDoc = await chatDoc.ref.collection('messages').doc(id).get();
      if (messageDoc.exists) {
        return {
          id: messageDoc.id,
          ...messageDoc.data(),
          createdAt: timestampToDate(messageDoc.data()!.createdAt)
        } as DBMessage;
      }
    }
    
    return null;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get message by id');
  }
}

// Vote operations
export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: 'up' | 'down';
}) {
  try {
    const voteRef = db.collection('chats').doc(chatId).collection('votes').doc(messageId);
    await voteRef.set({
      chatId,
      messageId,
      isUpvoted: type === 'up'
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to vote message');
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    const snapshot = await db.collection('chats').doc(id).collection('votes').get();
    return snapshot.docs.map(doc => doc.data()) as Vote[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get votes by chat id');
  }
}

// Document operations
export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    await db.collection('documents').doc(id).set({
      title,
      kind,
      content,
      userId,
      createdAt: dateToTimestamp(new Date())
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save document');
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const snapshot = await db.collection('documents').where('userId', '==', id)
      .orderBy('createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as Document[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get documents by id');
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const doc = await db.collection('documents').doc(id).get();
    if (!doc.exists) {
      return null;
    }
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data()!.createdAt)
    } as Document;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get document by id');
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    const snapshot = await db.collection('documents')
      .where('userId', '==', id)
      .where('createdAt', '>', dateToTimestamp(timestamp))
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as Document[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete documents by id after timestamp');
  }
}

// Suggestion operations
export async function saveSuggestions({
  suggestions,
}: {
  suggestions: Array<Suggestion>;
}) {
  try {
    const batch = db.batch();
    
    suggestions.forEach(suggestion => {
      const suggestionRef = db.collection('documents').doc(suggestion.documentId)
        .collection('suggestions').doc(suggestion.id);
      batch.set(suggestionRef, {
        ...suggestion,
        createdAt: dateToTimestamp(suggestion.createdAt),
        documentCreatedAt: dateToTimestamp(suggestion.documentCreatedAt)
      });
    });
    
    await batch.commit();
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to save suggestions');
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    const snapshot = await db.collection('documents').doc(documentId)
      .collection('suggestions')
      .orderBy('createdAt', 'desc')
      .get();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt),
      documentCreatedAt: timestampToDate(doc.data().documentCreatedAt)
    })) as Suggestion[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get suggestions by document id');
  }
}

// Additional operations
export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const snapshot = await db.collection('chats').doc(chatId)
      .collection('messages')
      .where('createdAt', '>', dateToTimestamp(timestamp))
      .get();
    
    const batch = db.batch();
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as DBMessage[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to delete messages by chat id after timestamp');
  }
}

export async function updateChatVisiblityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: 'private' | 'public';
}) {
  try {
    await db.collection('chats').doc(chatId).update({ visibility });
    
    const doc = await db.collection('chats').doc(chatId).get();
    return {
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data()!.createdAt)
    } as Chat;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to update chat visibility by id');
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: { id: string; differenceInHours: number }) {
  try {
    const hoursAgo = new Date(Date.now() - differenceInHours * 60 * 60 * 1000);
    
    // Get all chats for the user
    const chatsSnapshot = await db.collection('chats').where('userId', '==', id).get();
    
    let totalMessages = 0;
    
    // Count messages in each chat
    for (const chatDoc of chatsSnapshot.docs) {
      const messagesSnapshot = await chatDoc.ref.collection('messages')
        .where('createdAt', '>=', dateToTimestamp(hoursAgo))
        .get();
      totalMessages += messagesSnapshot.size;
    }
    
    return totalMessages;
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get message count by user id');
  }
}

// Stream operations
export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    await db.collection('chats').doc(chatId).collection('streams').doc(streamId).set({
      chatId,
      createdAt: dateToTimestamp(new Date())
    });
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to create stream id');
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const snapshot = await db.collection('chats').doc(chatId).collection('streams').get();
    return snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: timestampToDate(doc.data().createdAt)
    })) as Stream[];
  } catch (error) {
    throw new ChatSDKError('bad_request:database', 'Failed to get stream ids by chat id');
  }
}
