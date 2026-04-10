import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import {
  syncFirebaseUserToFirestore,
  verifyFirebaseToken,
} from '@/lib/auth/firebase-auth';
import {
  authorizeLocalTestCredentials,
  ensureLocalTestUserInFirestore,
} from '@/lib/auth/local-test-login';
import { authConfig } from './auth.config';
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
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        idToken: { label: 'Firebase ID token', type: 'text' },
      },
      async authorize({ email, password, idToken }: any) {
        if (idToken) {
          const firebaseUser = await verifyFirebaseToken(idToken);

          if (!firebaseUser || firebaseUser.disabled) {
            return null;
          }

          try {
            await syncFirebaseUserToFirestore(firebaseUser.uid);

            return {
              id: firebaseUser.uid,
              email: firebaseUser.email,
              type: 'regular',
            };
          } catch (error) {
            console.error('Firebase token sign-in sync error:', error);
            return null;
          }
        }

        const localUser = authorizeLocalTestCredentials(email, password);
        if (localUser) {
          try {
            await ensureLocalTestUserInFirestore(localUser.id, localUser.email);
            return localUser;
          } catch (error) {
            console.error('Local test user Firestore sync error:', error);
            return null;
          }
        }

        return null;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id as string;
        token.email = user.email;
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
