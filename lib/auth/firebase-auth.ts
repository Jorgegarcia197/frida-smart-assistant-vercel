import 'server-only';

import { auth as firebaseAuth, db } from '../firebase';
import { generateHashedPassword } from '../db/utils';
import { ChatSDKError } from '../errors';
import type { User } from '../db/firebase-types';

export interface FirebaseAuthUser {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName?: string;
  photoURL?: string;
  disabled: boolean;
}

/**
 * Creates a user in both Firebase Auth and Firestore users collection
 */
export async function createFirebaseUser(email: string, password: string): Promise<{ id: string; email: string }> {
  try {
    // Create user in Firebase Auth
    const userRecord = await firebaseAuth.createUser({
      email,
      password,
      emailVerified: false,
    });

    // Create user document in Firestore
    const userData = {
      email,
      password: generateHashedPassword(password), // Still hash for compatibility
      createdAt: new Date(),
    };

    await db.collection('users').doc(userRecord.uid).set(userData);

    return {
      id: userRecord.uid,
      email: userRecord.email!,
    };
  } catch (error: any) {
    // Handle Firebase Auth errors
    if (error.code === 'auth/email-already-exists') {
      throw new ChatSDKError('bad_request:auth', 'Email already exists');
    }
    if (error.code === 'auth/invalid-email') {
      throw new ChatSDKError('bad_request:auth', 'Invalid email format');
    }
    if (error.code === 'auth/weak-password') {
      throw new ChatSDKError('bad_request:auth', 'Password is too weak');
    }
    
    console.error('Firebase Auth creation error:', error);
    throw new ChatSDKError('bad_request:auth', 'Failed to create user');
  }
}

/**
 * Gets a user from Firebase Auth
 */
export async function getFirebaseUser(email: string): Promise<FirebaseAuthUser | null> {
  try {
    const userRecord = await firebaseAuth.getUserByEmail(email);
    return {
      uid: userRecord.uid,
      email: userRecord.email!,
      emailVerified: userRecord.emailVerified,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      disabled: userRecord.disabled,
    };
  } catch (error: any) {
    if (error.code === 'auth/user-not-found') {
      return null;
    }
    throw error;
  }
}

/**
 * Verifies a Firebase Auth custom token
 */
export async function verifyFirebaseToken(token: string): Promise<FirebaseAuthUser | null> {
  try {
    const decodedToken = await firebaseAuth.verifyIdToken(token);
    const userRecord = await firebaseAuth.getUser(decodedToken.uid);
    
    return {
      uid: userRecord.uid,
      email: userRecord.email!,
      emailVerified: userRecord.emailVerified,
      displayName: userRecord.displayName,
      photoURL: userRecord.photoURL,
      disabled: userRecord.disabled,
    };
  } catch (error) {
    console.error('Token verification error:', error);
    return null;
  }
}

/**
 * Creates a custom token for Firebase Auth (useful for server-side auth)
 */
export async function createCustomToken(uid: string): Promise<string> {
  try {
    return await firebaseAuth.createCustomToken(uid);
  } catch (error) {
    console.error('Custom token creation error:', error);
    throw new ChatSDKError('bad_request:auth', 'Failed to create custom token');
  }
}

/**
 * Updates user password in Firebase Auth
 */
export async function updateFirebaseUserPassword(uid: string, newPassword: string): Promise<void> {
  try {
    await firebaseAuth.updateUser(uid, {
      password: newPassword,
    });

    // Also update the hashed password in Firestore for compatibility
    const hashedPassword = generateHashedPassword(newPassword);
    await db.collection('users').doc(uid).update({
      password: hashedPassword,
    });
  } catch (error) {
    console.error('Password update error:', error);
    throw new ChatSDKError('bad_request:auth', 'Failed to update password');
  }
}

/**
 * Deletes a user from both Firebase Auth and Firestore
 */
export async function deleteFirebaseUser(uid: string): Promise<void> {
  try {
    // Delete from Firebase Auth
    await firebaseAuth.deleteUser(uid);

    // Delete from Firestore
    await db.collection('users').doc(uid).delete();
  } catch (error) {
    console.error('User deletion error:', error);
    throw new ChatSDKError('bad_request:auth', 'Failed to delete user');
  }
}

/**
 * Validates Firebase Auth credentials using Firebase Auth REST API
 */
export async function validateFirebaseCredentials(email: string, password: string): Promise<FirebaseAuthUser | null> {
  try {
    const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
    if (!apiKey) {
      console.error('Firebase API key not configured. Please set NEXT_PUBLIC_FIREBASE_API_KEY in your environment variables.');
      return null;
    }

    console.log('Attempting Firebase Auth validation for:', email);

    // Use Firebase Auth REST API to validate credentials
    const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Firebase Auth validation failed:', {
        status: response.status,
        statusText: response.statusText,
        error: error
      });
      return null;
    }

    const data = await response.json();
    console.log('Firebase Auth validation successful for:', email);
    
    // Get the full user record from Firebase Admin
    const firebaseUser = await getFirebaseUser(email);
    if (firebaseUser) {
      console.log('Successfully retrieved Firebase user record');
      return firebaseUser;
    } else {
      console.error('Could not retrieve Firebase user record after successful auth');
      return null;
    }
  } catch (error) {
    console.error('Firebase credential validation error:', error);
    return null;
  }
}

/**
 * Syncs a user from Firebase Auth to Firestore (useful for existing Firebase Auth users)
 */
export async function syncFirebaseUserToFirestore(uid: string): Promise<User> {
  try {
    const userRecord = await firebaseAuth.getUser(uid);
    
    const userData: Partial<User> = {
      email: userRecord.email!,
      createdAt: new Date(userRecord.metadata.creationTime),
    };

    // Check if user already exists in Firestore
    const userDoc = await db.collection('users').doc(uid).get();
    
    if (!userDoc.exists) {
      await db.collection('users').doc(uid).set(userData);
    }

    return {
      id: uid,
      email: userRecord.email!,
      createdAt: new Date(userRecord.metadata.creationTime),
    } as User;
  } catch (error) {
    console.error('User sync error:', error);
    throw new ChatSDKError('bad_request:auth', 'Failed to sync user');
  }
} 