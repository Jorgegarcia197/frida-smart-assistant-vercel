# Firebase Migration Setup Guide

This guide will help you migrate from PostgreSQL and Vercel Blob to Firebase.

## 1. Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Create a project" or "Add project"
3. Enter your project name
4. Enable Google Analytics (optional)
5. Click "Create project"

## 2. Enable Firebase Authentication

1. In your Firebase project, go to "Authentication"
2. Click "Get started"
3. Go to "Sign-in method" tab
4. Enable "Email/Password" provider
5. Click "Save"

## 3. Enable Firestore Database

1. In your Firebase project, go to "Firestore Database"
2. Click "Create database"
3. Choose "Start in test mode" (you can secure it later)
4. Select a location for your database
5. Click "Done"

## 4. Enable Firebase Storage

1. Go to "Storage" in the Firebase console
2. Click "Get started"
3. Choose "Start in test mode"
4. Select a location
5. Click "Done"

## 5. Generate Service Account Key

1. Go to Project Settings (gear icon)
2. Click on "Service accounts" tab
3. Click "Generate new private key"
4. Download the JSON file
5. Copy the entire JSON content

## 6. Environment Variables

Create a `.env.local` file in your project root with the following variables:

```env
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT='{"type": "service_account", "project_id": "your-project-id", ...}'
FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"

# Firebase Client Configuration (for NextAuth integration)
NEXT_PUBLIC_FIREBASE_API_KEY="your-firebase-api-key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your-project-id.firebaseapp.com"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your-project-id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your-project-id.appspot.com"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your-messaging-sender-id"
NEXT_PUBLIC_FIREBASE_APP_ID="your-app-id"

# NextAuth Configuration
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3000"

# AI Provider Configuration
NEXT_PUBLIC_OPENAI_RESOURCE_NAME="your-azure-openai-resource"
NEXT_PUBLIC_OPENAI_API_KEY="your-azure-openai-api-key"

# AWS Bedrock Configuration (for reasoning model)
NEXT_PUBLIC_AWS_REGION="us-east-1"
NEXT_PUBLIC_AWS_ACCESS_KEY_ID="your-aws-access-key"
NEXT_PUBLIC_AWS_SECRET_ACCESS_KEY="your-aws-secret-key"
NEXT_PUBLIC_AWS_SESSION_TOKEN="your-aws-session-token"
```

## 7. Install Dependencies

Run the following command to install Firebase dependencies:

```bash
# Using npm
npm install firebase-admin firebase

# Using bun
bun install firebase-admin firebase
```

## 8. Firestore Security Rules

Go to Firestore Database > Rules and update the rules:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users can only access their own user document
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Users can only access their own chats
    match /chats/{chatId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      
      // Allow access to subcollections
      match /messages/{messageId} {
        allow read, write: if request.auth != null;
      }
      match /votes/{voteId} {
        allow read, write: if request.auth != null;
      }
      match /streams/{streamId} {
        allow read, write: if request.auth != null;
      }
    }
    
    // Users can only access their own documents
    match /documents/{documentId} {
      allow read, write: if request.auth != null && resource.data.userId == request.auth.uid;
      
      match /suggestions/{suggestionId} {
        allow read, write: if request.auth != null;
      }
    }
  }
}
```

## 9. Firebase Storage Rules

Go to Storage > Rules and update the rules:

```javascript
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /uploads/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null;
    }
  }
}
```

## 10. Data Migration (Optional)

If you have existing data in PostgreSQL, you'll need to migrate it to Firestore. This involves:

1. Exporting data from PostgreSQL
2. Transforming the relational data to document format
3. Importing into Firestore collections

## 11. Testing

1. Start your development server: `npm run dev`
2. Test user registration/login
3. Test chat functionality
4. Test file uploads
5. Test document creation

## Firestore Data Structure

The app uses the following Firestore collections:

- `users`: User documents
- `chats`: Chat documents with subcollections:
  - `messages`: Chat messages
  - `votes`: Message votes
  - `streams`: Stream IDs
- `documents`: Document artifacts with subcollections:
  - `suggestions`: Document suggestions

## Firebase Auth Integration

The app now integrates Firebase Authentication with NextAuth:

1. **Dual Authentication**: Users are created in both Firebase Auth and Firestore
2. **Automatic Sync**: Firebase Auth users are automatically synced to Firestore
3. **Backward Compatibility**: Existing Firestore-only users still work
4. **Enhanced Security**: Leverages Firebase Auth's built-in security features

### How it works

1. When a user registers, they're created in Firebase Auth first
2. Then a corresponding document is created in the Firestore `users` collection
3. During login, the system checks both Firebase Auth and Firestore
4. Guest users are still created only in Firestore for simplicity

## Key Differences from PostgreSQL

1. **No Foreign Keys**: Firestore uses document references instead
2. **Subcollections**: Related data is stored in subcollections
3. **NoSQL Structure**: Data is denormalized for better performance
4. **Real-time**: Firestore supports real-time listeners
5. **Automatic Scaling**: No need to manage database scaling
6. **Integrated Auth**: Firebase Auth provides built-in user management

## Troubleshooting

1. **Authentication Issues**: Make sure your service account has the correct permissions
2. **Storage Issues**: Check that your storage bucket name is correct
3. **Rule Issues**: Ensure your Firestore rules allow the operations you're trying to perform
4. **Environment Variables**: Double-check that all environment variables are set correctly
