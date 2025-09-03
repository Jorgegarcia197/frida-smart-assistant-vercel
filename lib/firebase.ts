import admin from 'firebase-admin';

// Ensure we're not using the emulator for admin operations
if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.warn(
    '🚨 FIRESTORE_EMULATOR_HOST detected. Unsetting for Firebase Admin SDK...',
  );
  process.env.FIRESTORE_EMULATOR_HOST = undefined;
}

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

      console.log(
        '✅ Firebase Admin SDK initialized with service account credentials',
      );
    } else {
      // For local development without service account
      // This will use the default credentials or emulator
      console.warn(
        '⚠️  FIREBASE_SERVICE_ACCOUNT not configured. Using default credentials or emulator.',
      );
      console.warn('⚠️  This may cause authentication issues in production.');
      console.warn(
        '💡 Set FIREBASE_SERVICE_ACCOUNT in your .env.local file for proper authentication.',
      );

      const projectId =
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'aiopswebapp';
      const storageBucket =
        process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

      admin.initializeApp({
        projectId,
        storageBucket,
      });

      console.log(
        `🔧 Firebase Admin SDK initialized with project ID: ${projectId}`,
      );
    }
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK:', error);
    console.log(
      '💡 Make sure FIREBASE_SERVICE_ACCOUNT is properly configured in your .env.local file',
    );
    console.log(
      '💡 The service account JSON should be a valid JSON string with proper credentials',
    );

    // Fallback initialization for development
    const projectId =
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'aiopswebapp';
    const storageBucket =
      process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`;

    admin.initializeApp({
      projectId,
      storageBucket,
    });

    console.log(
      `🔧 Using fallback Firebase initialization with project ID: ${projectId}`,
    );
  }
}

export const db = admin.firestore();
export const storage = admin.storage();
export const auth = admin.auth();

// Add a function to test Firebase connection
export async function testFirebaseConnection(): Promise<boolean> {
  try {
    // Simple test to verify connection and permissions
    const testDoc = await db.collection('_test').limit(1).get();
    console.log('✅ Firebase connection test successful');
    return true;
  } catch (error) {
    console.error('❌ Firebase connection test failed:', error);
    console.error(
      'This usually indicates authentication or permission issues.',
    );
    return false;
  }
}

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
