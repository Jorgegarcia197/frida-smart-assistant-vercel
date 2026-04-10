import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { db } from '@/lib/firebase';

/**
 * Local email/password login is only allowed when:
 * - NODE_ENV is `development`
 * - LOCAL_AUTH_TEST_EMAIL and LOCAL_AUTH_TEST_PASSWORD are both set (e.g. in .env.local)
 *
 * Never set these in production environments.
 */
export function isLocalTestCredentialsConfigured(): boolean {
  if (process.env.NODE_ENV !== 'development') {
    return false;
  }
  const email = process.env.LOCAL_AUTH_TEST_EMAIL?.trim();
  const password = process.env.LOCAL_AUTH_TEST_PASSWORD;
  return Boolean(email && password);
}

function constantTimeEqualUtf8(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Validates against env and returns a NextAuth user object, or null if not applicable / invalid.
 */
export function authorizeLocalTestCredentials(
  email: unknown,
  password: unknown,
): { id: string; email: string; type: 'regular' } | null {
  if (!isLocalTestCredentialsConfigured()) {
    return null;
  }
  if (typeof email !== 'string' || typeof password !== 'string') {
    return null;
  }

  const rawEmail = process.env.LOCAL_AUTH_TEST_EMAIL;
  const expectedPassword = process.env.LOCAL_AUTH_TEST_PASSWORD;
  if (!rawEmail || expectedPassword === undefined) {
    return null;
  }

  const expectedEmail = rawEmail.trim().toLowerCase();
  if (email.trim().toLowerCase() !== expectedEmail) {
    return null;
  }

  if (!constantTimeEqualUtf8(password, expectedPassword)) {
    return null;
  }

  const id = process.env.LOCAL_AUTH_TEST_USER_ID?.trim() || 'local-test-user';

  return {
    id,
    email: expectedEmail,
    type: 'regular',
  };
}

export async function ensureLocalTestUserInFirestore(
  userId: string,
  email: string,
): Promise<void> {
  await db.collection('users').doc(userId).set(
    {
      email,
      createdAt: new Date(),
    },
    { merge: true },
  );
}
