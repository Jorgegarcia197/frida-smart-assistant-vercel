import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';

export type SessionUserIdResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * MCP management routes must scope work to the signed-in user only.
 * Do not trust client-supplied identifiers (e.g. x-user-id headers).
 */
export async function requireSessionUserId(): Promise<SessionUserIdResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }
  return { ok: true, userId };
}
