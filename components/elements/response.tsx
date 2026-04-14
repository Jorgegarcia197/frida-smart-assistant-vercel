'use client';

import { cn } from '@/lib/utils';
import { type ComponentProps, memo } from 'react';
import { Streamdown } from 'streamdown';

type ResponseProps = ComponentProps<typeof Streamdown>;

export const Response = memo(
  ({ className, ...props }: ResponseProps) => (
    <Streamdown
      className={cn(
        'size-full [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_pre]:overflow-x-auto [&_pre]:max-w-full [&_code]:break-words [&_code]:whitespace-pre-wrap',
        // Markdown tables: Streamdown uses w-full on <table>, which squeezes columns in narrow
        // bubbles. Let the table size to content (min full width) so the inner scroll area works.
        '[&_[data-streamdown=table]]:w-max [&_[data-streamdown=table]]:min-w-full [&_[data-streamdown=table]]:border-collapse',
        '[&_[data-streamdown=table]]:text-left [&_[data-streamdown=table]_th]:border [&_[data-streamdown=table]_td]:border [&_[data-streamdown=table]_th]:border-border [&_[data-streamdown=table]_td]:border-border',
        '[&_[data-streamdown=table]_th]:bg-muted/60 [&_[data-streamdown=table]_th]:px-3 [&_[data-streamdown=table]_th]:py-2 [&_[data-streamdown=table]_td]:px-3 [&_[data-streamdown=table]_td]:py-2',
        '[&_[data-streamdown=table]_th]:whitespace-nowrap [&_[data-streamdown=table]_td]:align-top',
        '[&_[data-streamdown=table]_tbody_tr:nth-child(even)]:bg-muted/20',
        className,
      )}
      {...props}
    />
  ),
  (prevProps, nextProps) => prevProps.children === nextProps.children,
);

Response.displayName = 'Response';
