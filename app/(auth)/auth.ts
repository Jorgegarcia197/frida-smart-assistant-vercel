import { compare } from 'bcrypt-ts';
import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { createGuestUser, getUser } from '@/lib/db/queries';
import { syncFirebaseUserToFirestore, validateFirebaseCredentials } from '@/lib/auth/firebase-auth';
import { authConfig } from './auth.config';
import { DUMMY_PASSWORD } from '@/lib/constants';
import type { DefaultJWT } from 'next-auth/jwt';

export type UserType = 'guest' | 'regular';

declare module 'next-auth' {
  interface Session extends DefaultSession {
    user: {
      id: string;
      type: UserType;
    } & DefaultSession['user'];
  }

  interface User {
    id?: string;
    email?: string | null;
    type: UserType;
  }
}

declare module 'next-auth/jwt' {
  interface JWT extends DefaultJWT {
    id: string;
    type: UserType;
  }
}

export const {
  handlers: { GET, POST },
  auth,
  signIn,
  signOut,
} = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {},
      async authorize({ email, password }: any) {
        console.log('NextAuth authorize called for:', email);
        
        // First try to validate credentials with Firebase Auth
        const firebaseUser = await validateFirebaseCredentials(email, password);
        
        if (firebaseUser) {
          console.log('Firebase Auth validation successful, syncing to Firestore...');
          // If Firebase Auth validation succeeds, sync to Firestore if needed
          try {
            const syncedUser = await syncFirebaseUserToFirestore(firebaseUser.uid);
            console.log('User sync successful, returning user object');
            return { id: firebaseUser.uid, email: firebaseUser.email, type: 'regular' };
          } catch (error) {
            console.error('Firebase sync error:', error);
            return null;
          }
        } else {
          console.log('Firebase Auth validation failed, trying Firestore fallback...');
        }

        // Fallback to Firestore-only users (for backward compatibility)
        const users = await getUser(email);

        if (users.length === 0) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const [user] = users;

        if (!user.password) {
          await compare(password, DUMMY_PASSWORD);
          return null;
        }

        const passwordsMatch = await compare(password, user.password);

        if (!passwordsMatch) {
          console.log('Firestore password validation failed');
          return null;
        }

        console.log('Firestore password validation successful, returning user');
        return { ...user, type: 'regular' };
      },
    }),
    Credentials({
      id: 'guest',
      credentials: {},
      async authorize() {
        const [guestUser] = await createGuestUser();
        return { ...guestUser, type: 'guest' };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.type = user.type;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.type = token.type;
      }

      return session;
    },
  },
});
