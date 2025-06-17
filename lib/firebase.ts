import admin from 'firebase-admin';

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    // Check if we have a service account configured
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (serviceAccountJson && serviceAccountJson !== '{}') {
      // Parse the service account JSON
      const serviceAccount = JSON.parse(serviceAccountJson);
      
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } else {
      // For local development without service account
      // This will use the default credentials or emulator
      console.warn('⚠️  FIREBASE_SERVICE_ACCOUNT not configured. Using default credentials or emulator.');
      
      admin.initializeApp({
        projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'aiopswebapp',
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'aiopswebapp.appspot.com',
      });
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    console.log('💡 Make sure FIREBASE_SERVICE_ACCOUNT is properly configured in your .env.local file');
    
    // Fallback initialization for development
    admin.initializeApp({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'aiopswebapp',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'aiopswebapp.appspot.com',
    });
  }
}

export const db = admin.firestore();
export const storage = admin.storage();
export const auth = admin.auth();

// Helper function to generate Firestore-compatible IDs
export function generateFirestoreId(): string {
  return db.collection('_').doc().id;
}

// Helper function to convert Firestore timestamp to Date
export function timestampToDate(timestamp: admin.firestore.Timestamp): Date {
  return timestamp.toDate();
}

// Helper function to convert Date to Firestore timestamp
export function dateToTimestamp(date: Date): admin.firestore.Timestamp {
  return admin.firestore.Timestamp.fromDate(date);
} 