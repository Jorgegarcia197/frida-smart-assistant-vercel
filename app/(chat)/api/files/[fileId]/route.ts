import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import { getOpenAICompatibleRuntimeConfig } from '@/lib/ai/providers';

type RouteContext = {
  params: Promise<{
    fileId: string;
  }>;
};

function stripTrailingSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { fileId } = await context.params;
  const { apiKey, baseUrl } = getOpenAICompatibleRuntimeConfig();

  if (!apiKey || !baseUrl) {
    return NextResponse.json(
      { error: 'OpenAI-compatible API is not configured' },
      { status: 503 },
    );
  }

  const upstreamResponse = await fetch(
    `${stripTrailingSlash(baseUrl)}/files/${encodeURIComponent(fileId)}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    },
  );

  if (!upstreamResponse.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch file metadata' },
      { status: upstreamResponse.status },
    );
  }

  const metadata = await upstreamResponse.json();
  return NextResponse.json(metadata);
}
