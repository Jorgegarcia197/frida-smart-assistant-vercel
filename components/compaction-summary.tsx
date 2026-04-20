'use client';

import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { useState } from 'react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from './ui/collapsible';
import { Response } from './elements/response';
import { Shimmer } from './elements/shimmer';
import { cn } from '@/lib/utils';

interface CompactionSummaryProps {
  text: string;
  /**
   * Optional tokens-removed / tokens-kept metadata surfaced by the gateway.
   * Rendered inline with the header when present.
   */
  meta?: {
    originalTokens?: number;
    compactedTokens?: number;
  };
  /** True while the compaction summary is still streaming in. */
  isStreaming?: boolean;
}

/**
 * Renders an Anthropic context-management `compact_20260112` summary as a
 * muted, collapsible block so it's visually distinct from regular model
 * output. Compaction events rewrite earlier turns into a short summary; we
 * keep that summary visible but collapsed-by-default to avoid noise.
 */
export function CompactionSummary({
  text,
  meta,
  isStreaming = false,
}: CompactionSummaryProps) {
  const [open, setOpen] = useState(false);

  const savings =
    meta?.originalTokens != null && meta?.compactedTokens != null
      ? `${meta.compactedTokens.toLocaleString()} / ${meta.originalTokens.toLocaleString()} tokens`
      : null;

  const hasBody = text.trim().length > 0;

  if (isStreaming && !hasBody) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-amber-500/25 bg-amber-500/[0.06]',
          'px-3 py-3 flex items-center gap-3 w-full min-w-0',
        )}
        aria-busy="true"
        aria-live="polite"
      >
        <div className="min-w-0 flex-1">
          <Shimmer className="text-sm font-medium text-muted-foreground">
            Summarizing…
          </Shimmer>
          <p className="text-xs text-muted-foreground/80 mt-1">
            Compressing earlier context
          </p>
        </div>
      </div>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-full">
      <div
        className={cn(
          'rounded-lg border border-dashed border-muted-foreground/30 bg-muted/40',
          'text-sm text-muted-foreground',
        )}
      >
        <CollapsibleTrigger
          className={cn(
            'w-full flex items-center gap-2 px-3 py-2',
            'hover:bg-muted/60 transition-colors rounded-lg',
            'text-left',
          )}
        >
          {open ? (
            <ChevronDownIcon className="size-4 shrink-0" />
          ) : (
            <ChevronRightIcon className="size-4 shrink-0" />
          )}
          {isStreaming && hasBody ? (
            <Shimmer className="font-medium text-foreground/90">
              Summarizing…
            </Shimmer>
          ) : (
            <span className="font-medium">Conversation summary</span>
          )}
          <span className="text-xs opacity-70">
            (context compacted{savings ? ` · ${savings}` : ''})
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="px-3 pb-3 pt-0">
          <div className="prose prose-sm max-w-none dark:prose-invert text-muted-foreground">
            <Response>{text}</Response>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
