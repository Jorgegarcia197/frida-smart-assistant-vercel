'use client';

import { Bookmark, CheckCircle2, List, Trash2, XCircle } from 'lucide-react';
import { Shimmer } from './elements/shimmer';
import { Badge } from './ui/badge';
import { cn } from '@/lib/utils';

type MemoryAction = 'create' | 'read' | 'update' | 'delete' | 'list';

function parseAction(input: unknown): MemoryAction | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const a = (input as Record<string, unknown>).action;
  if (
    a === 'create' ||
    a === 'read' ||
    a === 'update' ||
    a === 'delete' ||
    a === 'list'
  ) {
    return a;
  }
  return undefined;
}

function callLabel(action: MemoryAction | undefined): string {
  switch (action) {
    case 'create':
      return 'Saving to memory';
    case 'update':
      return 'Updating memory';
    case 'delete':
      return 'Removing from memory';
    case 'read':
      return 'Reading memory';
    case 'list':
      return 'Loading memories';
    default:
      return 'Using memory';
  }
}

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

export function MemoryToolDisplay({
  state,
  input,
  output,
  errorText,
}: {
  state: 'call' | 'result' | 'error';
  input?: unknown;
  output?: unknown;
  errorText?: string;
}) {
  const action = parseAction(input);

  if (state === 'call') {
    return (
      <div
        className={cn(
          'rounded-xl border border-violet-500/20 bg-violet-500/5',
          'px-3 py-2.5 flex items-start gap-3 w-full min-w-0',
        )}
      >
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300">
          <Bookmark className="size-4" aria-hidden />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <span className="text-xs font-medium text-violet-900/90 dark:text-violet-100/90">
            Memory
          </span>
          <Shimmer className="text-sm text-muted-foreground">
            {callLabel(action)}…
          </Shimmer>
        </div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        className={cn(
          'rounded-xl border border-destructive/30 bg-destructive/5',
          'px-3 py-2.5 flex items-start gap-3 w-full min-w-0',
        )}
      >
        <XCircle className="size-5 shrink-0 text-destructive mt-0.5" />
        <div className="min-w-0 text-sm text-destructive">
          <span className="font-medium">Memory</span>
          <p className="mt-1 opacity-90">{errorText ?? 'Something went wrong.'}</p>
        </div>
      </div>
    );
  }

  // output-available
  const out = output as Record<string, unknown> | null;
  if (!out || typeof out !== 'object') {
    return (
      <div className="rounded-xl border px-3 py-2 text-sm text-muted-foreground">
        Memory updated
      </div>
    );
  }

  if (out.ok === false) {
    const err =
      typeof out.error === 'string' ? out.error : 'Memory operation failed';
    return (
      <div
        className={cn(
          'rounded-xl border border-amber-500/25 bg-amber-500/5',
          'px-3 py-2.5 flex items-start gap-3 w-full min-w-0',
        )}
      >
        <XCircle className="size-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
        <div className="min-w-0 text-sm">
          <span className="font-medium text-foreground">Memory</span>
          <p className="mt-1 text-muted-foreground">{err}</p>
        </div>
      </div>
    );
  }

  const mem = out.memory as Record<string, unknown> | undefined;
  const memories = out.memories as Array<Record<string, unknown>> | undefined;
  const count = typeof out.count === 'number' ? out.count : undefined;
  const deleted = out.deleted === true;
  const inputAction = parseAction(input);

  if (mem && typeof mem.key === 'string') {
    const value =
      typeof mem.value === 'string' ? mem.value : '';
    const updatedAt =
      typeof mem.updatedAt === 'string' ? mem.updatedAt : undefined;
    const title =
      inputAction === 'read'
        ? 'Retrieved from memory'
        : 'Saved to memory';
    return (
      <div
        className={cn(
          'rounded-xl border border-emerald-500/20 bg-emerald-500/5',
          'px-3 py-2.5 w-full min-w-0',
        )}
      >
        <div className="flex items-start gap-3">
          <CheckCircle2 className="size-5 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {title}
              </span>
              <Badge
                variant="secondary"
                className="font-mono text-xs max-w-[min(100%,14rem)] truncate"
              >
                {mem.key}
              </Badge>
            </div>
            {value ? (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
                {truncate(value, 400)}
              </p>
            ) : null}
            {updatedAt ? (
              <p className="text-[10px] text-muted-foreground/80 tabular-nums">
                {updatedAt}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (Array.isArray(memories)) {
    if (memories.length === 0) {
      return (
        <div
          className={cn(
            'rounded-xl border border-violet-500/15 bg-violet-500/[0.03]',
            'px-3 py-2.5 flex items-start gap-3 w-full min-w-0',
          )}
        >
          <List className="size-5 shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" />
          <p className="text-sm text-muted-foreground">No memories stored yet.</p>
        </div>
      );
    }
    return (
      <div
        className={cn(
          'rounded-xl border border-violet-500/15 bg-violet-500/[0.03]',
          'px-3 py-2.5 w-full min-w-0',
        )}
      >
        <div className="flex items-start gap-3">
          <List className="size-5 shrink-0 text-violet-600 dark:text-violet-400 mt-0.5" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-sm font-medium text-foreground">
              {count !== undefined
                ? `${count} ${count === 1 ? 'memory' : 'memories'}`
                : 'Memories'}
            </p>
            <ul className="space-y-1.5 text-sm text-muted-foreground">
              {memories.slice(0, 8).map((m) => {
                const k = typeof m.key === 'string' ? m.key : 'entry';
                const v = typeof m.value === 'string' ? m.value : '';
                return (
                  <li key={k} className="flex flex-col gap-0.5">
                    <Badge variant="outline" className="w-fit font-mono text-[11px]">
                      {k}
                    </Badge>
                    {v ? (
                      <span className="pl-0.5 leading-relaxed break-words">
                        {truncate(v, 120)}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {memories.length > 8 ? (
              <p className="text-xs text-muted-foreground">
                +{memories.length - 8} more
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (typeof out.key === 'string' && inputAction === 'delete') {
    if (deleted) {
      return (
        <div
          className={cn(
            'rounded-xl border border-muted bg-muted/40',
            'px-3 py-2.5 flex items-start gap-3 w-full min-w-0',
          )}
        >
          <Trash2 className="size-5 shrink-0 text-muted-foreground mt-0.5" />
          <div className="min-w-0 text-sm">
            <span className="font-medium text-foreground">Removed from memory</span>
            <Badge variant="secondary" className="ml-2 font-mono text-xs">
              {out.key}
            </Badge>
          </div>
        </div>
      );
    }
    return (
      <div
        className={cn(
          'rounded-xl border border-muted bg-muted/30',
          'px-3 py-2.5 text-sm text-muted-foreground',
        )}
      >
        No memory entry for{' '}
        <Badge variant="outline" className="font-mono text-xs">
          {out.key}
        </Badge>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'rounded-xl border border-violet-500/15 bg-violet-500/[0.03]',
        'px-3 py-2 text-sm text-muted-foreground',
      )}
    >
      Memory updated
    </div>
  );
}
