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
    `${stripTrailingSlash(baseUrl)}/files/${encodeURIComponent(fileId)}/content`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      cache: 'no-store',
    },
  );

  if (!upstreamResponse.ok || !upstreamResponse.body) {
    return NextResponse.json(
      { error: 'Failed to fetch file content' },
      { status: upstreamResponse.status || 502 },
    );
  }

  const headers = new Headers();
  const contentType = upstreamResponse.headers.get('content-type');
  const contentLength = upstreamResponse.headers.get('content-length');
  const contentDisposition = upstreamResponse.headers.get('content-disposition');

  if (contentType) headers.set('content-type', contentType);
  if (contentLength) headers.set('content-length', contentLength);
  if (contentDisposition) headers.set('content-disposition', contentDisposition);

  return new Response(upstreamResponse.body, {
    status: upstreamResponse.status,
    headers,
  });
}
