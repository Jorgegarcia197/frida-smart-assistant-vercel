'use client';

import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
import type { ChatMessage } from '@/lib/types';
import { BookIcon } from 'lucide-react';

export function faviconSrcForUrl(url: string): string | null {
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=32&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
}

/** Shared list body for `Sources` / web tool UIs (favicon + title + hostname + optional page age). */
export function WebSourceUrlRows({
  items,
}: {
  items: Array<{ url: string; title?: string; page_age?: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex max-w-lg flex-col gap-2 rounded-md border border-border/60 bg-muted/40 p-3">
      {items.map((part, index) => {
        const icon = faviconSrcForUrl(part.url);
        const key = `${part.url}-${index}`;
        const pageAge =
          typeof part.page_age === 'string' && part.page_age.trim().length > 0
            ? part.page_age.trim()
            : null;
        return (
          <Source
            key={key}
            href={part.url}
            title={part.title ?? part.url}
            className="min-w-0 items-start gap-2.5 no-underline hover:opacity-90"
          >
            {icon ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote favicon
              <img
                alt=""
                className="mt-0.5 size-4 shrink-0 rounded-sm"
                height={16}
                src={icon}
                width={16}
              />
            ) : (
              <BookIcon
                className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <span className="min-w-0 text-left">
              {pageAge ? (
                <span className="mb-0.5 block text-[11px] text-muted-foreground leading-snug">
                  Page age: {pageAge}
                </span>
              ) : null}
              <span className="block font-medium leading-snug">
                {part.title ?? part.url}
              </span>
              <span className="block truncate text-muted-foreground text-xs">
                {(() => {
                  try {
                    return new URL(part.url).hostname;
                  } catch {
                    return part.url;
                  }
                })()}
              </span>
            </span>
          </Source>
        );
      })}
    </div>
  );
}

/** Ordered `source-url` parts (for matching `[1]`, `[2]` in assistant text). */
export function collectOrderedSourceUrls(
  message: ChatMessage,
): Array<{ url: string; title?: string }> {
  if (message.role !== 'assistant') return [];
  const out: Array<{ url: string; title?: string }> = [];
  for (const p of message.parts ?? []) {
    if (p.type === 'source-url' && typeof p.url === 'string') {
      out.push({ url: p.url, title: p.title });
    }
  }
  return out;
}

export function MessageSources({ message }: { message: ChatMessage }) {
  if (message.role !== 'assistant') return null;

  const urlParts: Array<{
    key: string;
    type: 'source-url';
    url: string;
    title?: string;
  }> = [];
  const docParts: Array<{
    key: string;
    type: 'source-document';
    title: string;
    filename?: string;
    mediaType: string;
  }> = [];

  for (const p of message.parts ?? []) {
    if (p.type === 'source-url' && typeof p.url === 'string') {
      urlParts.push({
        key: `url-${p.sourceId}-${urlParts.length}`,
        type: 'source-url',
        url: p.url,
        title: p.title,
      });
    } else if (p.type === 'source-document') {
      docParts.push({
        key: `doc-${p.sourceId}-${docParts.length}`,
        type: 'source-document',
        title: p.title,
        filename: p.filename,
        mediaType: p.mediaType,
      });
    }
  }

  const count = urlParts.length + docParts.length;
  if (count === 0) return null;

  return (
    <Sources>
      <SourcesTrigger count={count} />
      <SourcesContent>
        <div className="flex flex-col gap-3">
          <WebSourceUrlRows
            items={urlParts.map((p) => ({ url: p.url, title: p.title }))}
          />
          {docParts.map((part) => (
            <div
              key={part.key}
              className="flex max-w-md items-start gap-2 rounded-md border border-border/60 bg-muted/40 p-3 text-foreground text-sm"
            >
              <BookIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0">
                <span className="font-medium">{part.title}</span>
                {part.filename ? (
                  <span className="text-muted-foreground">
                    {' '}
                    ({part.filename})
                  </span>
                ) : null}
                <span className="block text-muted-foreground text-xs">
                  {part.mediaType}
                </span>
              </span>
            </div>
          ))}
        </div>
      </SourcesContent>
    </Sources>
  );
}
