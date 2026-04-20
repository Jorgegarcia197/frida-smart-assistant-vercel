'use client';

import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselHeader,
  InlineCitationCarouselIndex,
  InlineCitationCarouselItem,
  InlineCitationCarouselNext,
  InlineCitationCarouselPrev,
  InlineCitationSource,
} from '@/components/ai-elements/inline-citation';
import { Response } from '@/components/elements/response';
import { cn, sanitizeText } from '@/lib/utils';

export type AssistantBracketSource = { url: string; title?: string };

export function shouldUseBracketCitationRendering(
  text: string,
  sources: AssistantBracketSource[],
): boolean {
  return sources.length > 0 && /\[\d+\]/.test(text);
}

/**
 * Renders assistant markdown with `[n]` markers turned into hoverable inline
 * citations when `sources[n-1]` exists (matches streamed `source-url` order).
 */
export function AssistantTextWithBracketRefs({
  text,
  sources,
  proseInvertInDark,
  className,
}: {
  text: string;
  sources: AssistantBracketSource[];
  proseInvertInDark?: boolean;
  className?: string;
}) {
  const bits = text.split(/(\[\d+\])/g);

  return (
    <div
      className={cn(
        'size-full max-w-none leading-relaxed',
        // Let Streamdown segments sit in one flow with citation badges.
        '[&_.streamdown]:inline [&_.streamdown]:max-w-none',
        '[&_p]:!my-0 [&_p]:inline [&_p]:align-baseline',
        '[&_ul]:!my-0 [&_ol]:!my-0',
        className,
      )}
    >
      {bits.map((bit, i) => {
        const m = /^\[(\d+)\]$/.exec(bit);
        if (m) {
          const refNum = m[1];
          const idx = Number(refNum) - 1;
          const src = sources[idx];
          if (!src?.url) {
            return (
              <span
                key={`ref-missing-source-${refNum}`}
                className="text-muted-foreground"
              >
                {bit}
              </span>
            );
          }
          return (
            <InlineCitation
              key={`ref-${refNum}-${src.url}`}
              className="inline align-baseline"
            >
              <InlineCitationCard>
                <InlineCitationCardTrigger
                  label={src.title}
                  sources={[src.url]}
                />
                <InlineCitationCardBody>
                  <InlineCitationCarousel>
                    <InlineCitationCarouselHeader>
                      <InlineCitationCarouselPrev />
                      <InlineCitationCarouselNext />
                      <InlineCitationCarouselIndex />
                    </InlineCitationCarouselHeader>
                    <InlineCitationCarouselContent>
                      <InlineCitationCarouselItem>
                        <InlineCitationSource
                          title={src.title}
                          url={src.url}
                        />
                      </InlineCitationCarouselItem>
                    </InlineCitationCarouselContent>
                  </InlineCitationCarousel>
                </InlineCitationCardBody>
              </InlineCitationCard>
            </InlineCitation>
          );
        }

        if (!bit) return null;

        return (
          <Response
            key={`txt-${i}-${bit.length}-${bit.slice(0, 24)}`}
            proseInvertInDark={proseInvertInDark}
            className="inline-block max-w-none align-baseline [&_.streamdown]:inline-block"
          >
            {sanitizeText(bit)}
          </Response>
        );
      })}
    </div>
  );
}
