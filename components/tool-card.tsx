'use client';

import { memo, useEffect, useMemo, useState } from 'react';
import { Image } from '@/components/ai-elements/image';
import {
  Task,
  TaskContent,
  TaskItem,
  TaskItemFile,
  TaskTrigger,
} from '@/components/ai-elements/task';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ChevronDownIcon,
  FileText,
  Plug,
  Server,
  Sparkles,
} from 'lucide-react';
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
import { Sources, SourcesContent, SourcesTrigger } from '@/components/ai-elements/sources';
import { WebSourceUrlRows } from '@/components/message-sources';
import { Response } from '@/components/elements/response';
import {
  isFridaNormalizedWebToolResult,
  redactWebToolDebugPayloadString,
} from '@/lib/ai/normalize-anthropic-web-tool-result';
import { getGeneratedFileTypeSubtitle } from '@/lib/generated-file-label';

export type ToolCardSource = 'mcp' | 'api';

interface ToolCardProps {
  /** MCP server id (e.g. northwindmcp) or a fixed label for API tools. */
  serverName: string;
  toolName: string;
  /** MCP tools use `server__tool` ids; agent HTTP tools do not. */
  toolSource?: ToolCardSource;
  description?: string;
  result?: any;
  state: 'call' | 'result';
  args?: any;
  isReadonly?: boolean;
  /** Hide card chrome; only show generated file download links (Anthropic code execution / skills). */
  anthropicDelegated?: boolean;
}

type FileMetadata = {
  filename?: string;
  mimeType?: string;
  error?: boolean;
};

function guessImageMediaTypeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/jpeg';
}

function isRenderableAgentImage(filename?: string, mimeType?: string): boolean {
  if (mimeType?.startsWith('image/')) {
    return true;
  }
  if (!filename) {
    return false;
  }
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(filename);
}

function fileImageMediaType(
  filename: string | undefined,
  mimeType?: string,
): string {
  if (mimeType?.startsWith('image/')) {
    return mimeType;
  }
  if (filename) {
    return guessImageMediaTypeFromFilename(filename);
  }
  return 'image/jpeg';
}

/** E2B desktop computer-use tool screenshot result (`lib/ai/tools/agent-computer-use-tools.ts`). */
function isE2bDesktopScreenshotResult(result: unknown): result is {
  ok: true;
  action: 'screenshot';
  dataBase64: string;
  mimeType: string;
  note?: string;
} {
  if (!result || typeof result !== 'object') return false;
  const r = result as Record<string, unknown>;
  return (
    r.ok === true &&
    r.action === 'screenshot' &&
    typeof r.dataBase64 === 'string' &&
    r.dataBase64.length > 0 &&
    typeof r.mimeType === 'string' &&
    String(r.mimeType).startsWith('image/')
  );
}

function formatContentStrippingScreenshotBase64(data: any): string | null {
  if (!data) return null;
  if (isE2bDesktopScreenshotResult(data)) {
    const { dataBase64, ...rest } = data;
    return JSON.stringify(
      {
        ...rest,
        dataBase64: `[omitted: ${dataBase64.length} chars of base64 PNG]`,
      },
      null,
      2,
    );
  }
  return null;
}

function GeneratedImageFromFile({
  fileId,
  mediaType,
  alt,
}: {
  fileId: string;
  mediaType: string;
  alt: string;
}) {
  const [base64, setBase64] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    const run = async () => {
      try {
        const response = await fetch(
          `/api/files/${encodeURIComponent(fileId)}/content`,
          { method: 'GET', cache: 'no-store', signal: ac.signal },
        );
        if (!response.ok) {
          throw new Error('fetch failed');
        }
        const buffer = await response.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i] ?? 0);
        }
        if (!cancelled) {
          setBase64(btoa(binary));
        }
      } catch {
        if (!cancelled && !ac.signal.aborted) {
          setFailed(true);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [fileId]);

  if (failed) {
    return (
      <p className="text-[10px] text-muted-foreground">
        Preview unavailable — use download below.
      </p>
    );
  }

  if (!base64) {
    return (
      <div
        className="h-40 w-full max-w-sm animate-pulse rounded-md bg-muted"
        aria-hidden
      />
    );
  }

  return (
    <Image
      base64={base64}
      uint8Array={new Uint8Array()}
      mediaType={mediaType}
      alt={alt}
      className="max-h-80 w-full max-w-sm border border-border object-contain"
    />
  );
}

function humanizeSkillToolName(toolName: string): string {
  return toolName.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const DEBUG_TOOL_INPUT_MAX_CHARS = 14_000;

/** Best-effort detail for provider tool failures (shown under generic message). */
function extractToolFailureDetail(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const o = result as Record<string, unknown>;
  if (typeof o.error === 'string' && o.error.trim()) {
    return o.error.trim().slice(0, 2000);
  }
  if (Array.isArray(o.content)) {
    const texts = o.content
      .filter(
        (c: unknown) =>
          c != null &&
          typeof c === 'object' &&
          (c as { type?: string }).type === 'text' &&
          typeof (c as { text?: string }).text === 'string',
      )
      .map((c: unknown) => (c as { text: string }).text);
    const joined = texts.join('\n').trim();
    if (joined) return joined.slice(0, 2000);
  }
  return null;
}

function formatToolInputForDebug(args: unknown, toolName?: string): string {
  if (args === undefined) return '';
  try {
    const s = typeof args === 'string' ? args : JSON.stringify(args, null, 2);
    let out =
      s.length <= DEBUG_TOOL_INPUT_MAX_CHARS
        ? s
        : `${s.slice(0, DEBUG_TOOL_INPUT_MAX_CHARS)}\n\n… [truncated ${s.length - DEBUG_TOOL_INPUT_MAX_CHARS} chars]`;
    if (typeof toolName === 'string' && UPSTREAM_WEB_TOOL_NAMES.has(toolName)) {
      out = redactWebToolDebugPayloadString(out);
    }
    return out;
  } catch {
    return String(args);
  }
}

const UPSTREAM_WEB_TOOL_NAMES = new Set([
  'web_search',
  'web_fetch',
  '$BUILT_IN_WEB_SEARCH',
]);

function isEffectivelyEmptyToolInput(args: unknown): boolean {
  if (args === undefined || args === null) return true;
  if (typeof args === 'object' && !Array.isArray(args)) {
    return Object.keys(args as object).length === 0;
  }
  if (typeof args === 'string') return args.trim().length === 0;
  return false;
}

function ToolInputDebugCollapsible({
  args,
  toolName,
}: {
  args: unknown;
  toolName?: string;
}) {
  if (args === undefined) {
    return null;
  }

  const upstreamWebEmptyInput =
    typeof toolName === 'string' &&
    UPSTREAM_WEB_TOOL_NAMES.has(toolName) &&
    isEffectivelyEmptyToolInput(args);

  const debugDefaultOpen = !(
    typeof toolName === 'string' && UPSTREAM_WEB_TOOL_NAMES.has(toolName)
  );

  return (
    <Collapsible defaultOpen={debugDefaultOpen} className="group space-y-0">
      <div className="px-0 pb-0.5 pt-1 group-data-[state=closed]:px-1 group-data-[state=closed]:pb-2">
        <CollapsibleTrigger
          className={cn(
            'group/trigger flex w-full items-center justify-between gap-2 rounded-md border border-dashed border-border/60',
            'bg-muted/20 px-4 py-2 text-left text-xs font-medium text-muted-foreground',
            'hover:bg-muted/40 hover:text-foreground',
            'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
          )}
        >
          <span>Tool input (debug)</span>
          <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/trigger:rotate-180" />
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
        <div className="px-0 pb-1">
          <div
            className={cn(
              'max-h-56 overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-3',
            )}
          >
            {upstreamWebEmptyInput ? (
              <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
                The compatible API runs this tool on the upstream model. The
                stream often omits JSON arguments here (
                <code className="rounded bg-muted px-1 font-mono text-[10px]">
                  {'{}'}
                </code>
                ), while search/fetch still executes and the assistant gets
                results on the next turn — expand{' '}
                <span className="font-medium">Tool output</span> below for the
                local stub, or rely on the assistant reply.
              </p>
            ) : null}
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
              {formatToolInputForDebug(args, toolName)}
            </pre>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function collectFileIds(value: unknown, ids: Set<string>, depth = 0): void {
  if (depth > 8 || value == null) return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectFileIds(item, ids, depth + 1);
    }
    return;
  }

  if (typeof value !== 'object') return;

  for (const [key, nestedValue] of Object.entries(value)) {
    if (key === 'file_ids' && Array.isArray(nestedValue)) {
      for (const item of nestedValue) {
        if (typeof item === 'string' && item.trim().length > 0) {
          ids.add(item.trim());
        }
      }
    } else if (key === 'file_id' && typeof nestedValue === 'string') {
      const fileId = nestedValue.trim();
      if (fileId.length > 0) ids.add(fileId);
    }

    collectFileIds(nestedValue, ids, depth + 1);
  }
}

function SingleGeneratedFileDownload({
  fileId,
  fileMetadataById,
  className,
}: {
  fileId: string;
  fileMetadataById: Record<string, FileMetadata>;
  className?: string;
}) {
  const meta = fileMetadataById[fileId];
  const filename = meta?.filename;
  const typeSubtitle = getGeneratedFileTypeSubtitle(filename, meta?.mimeType);
  const showImage =
    meta && !meta.error && isRenderableAgentImage(filename, meta.mimeType);
  const imageMediaType = fileImageMediaType(filename, meta?.mimeType);

  return (
    <div
      className={cn(
        'inline-flex max-w-full flex-col gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs transition-colors hover:bg-muted/50',
        className,
      )}
    >
      {showImage && (
        <GeneratedImageFromFile
          fileId={fileId}
          mediaType={imageMediaType}
          alt={filename ?? 'Generated image'}
        />
      )}
      <a
        href={`/api/files/${encodeURIComponent(fileId)}/content`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex max-w-full flex-col items-start text-left underline-offset-2 hover:underline"
      >
        <span className="truncate font-medium">
          Download {filename ?? fileId}
        </span>
        {typeSubtitle && (
          <span className="text-[10px] text-muted-foreground">
            {typeSubtitle}
          </span>
        )}
      </a>
    </div>
  );
}

function GeneratedFilesDownloads({
  fileIds,
  fileMetadataById,
}: {
  fileIds: string[];
  fileMetadataById: Record<string, FileMetadata>;
}) {
  if (fileIds.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full flex-wrap gap-2">
      {fileIds.map((fileId) => (
        <SingleGeneratedFileDownload
          key={fileId}
          fileId={fileId}
          fileMetadataById={fileMetadataById}
        />
      ))}
    </div>
  );
}

function AnthropicSkillsTaskTrigger({ title }: { title: string }) {
  return (
    <TaskTrigger title={title}>
      <div className="flex w-full cursor-pointer items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <p className="min-w-0 flex-1 text-left font-medium text-foreground">
          {title}
        </p>
        <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
      </div>
    </TaskTrigger>
  );
}

function PureToolCard({
  serverName,
  toolName,
  toolSource = 'mcp',
  description,
  result,
  state,
  args,
  isReadonly = false,
  anthropicDelegated = false,
}: ToolCardProps) {
  const formatContent = (data: any) => {
    if (!data) return null;

    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object') {
      if (isFridaNormalizedWebToolResult(data)) {
        return data.summary;
      }
      // Try to find text content in common MCP result structures
      if (data.content && Array.isArray(data.content)) {
        return data.content
          .map((item: any) => item.text || item.content || JSON.stringify(item))
          .join('\n');
      }

      if (data.text) {
        return data.text;
      }

      if (data.message) {
        return data.message;
      }

      // Fallback to JSON for complex objects, but make it readable
      return JSON.stringify(data, null, 2);
    }

    return String(data);
  };

  const e2bScreenshot =
    state === 'result' && isE2bDesktopScreenshotResult(result) ? result : null;

  const displayContent =
    e2bScreenshot != null
      ? formatContentStrippingScreenshotBase64(e2bScreenshot)
      : state === 'result'
        ? formatContent(result)
        : formatContent(args);
  const isLoading = state === 'call';
  const [fileMetadataById, setFileMetadataById] = useState<
    Record<string, FileMetadata>
  >({});
  const fileIds = useMemo(() => {
    const ids = new Set<string>();
    const source = state === 'result' ? result : args;
    collectFileIds(source, ids);
    return Array.from(ids);
  }, [state, result, args]);

  useEffect(() => {
    if (isLoading || fileIds.length === 0) return;

    const missingFileIds = fileIds.filter(
      (fileId) => !fileMetadataById[fileId],
    );
    if (missingFileIds.length === 0) return;

    const abortController = new AbortController();
    let isActive = true;

    const fetchMetadata = async () => {
      const results = await Promise.all(
        missingFileIds.map(async (fileId) => {
          try {
            const response = await fetch(
              `/api/files/${encodeURIComponent(fileId)}`,
              {
                method: 'GET',
                cache: 'no-store',
                signal: abortController.signal,
              },
            );

            if (!response.ok) {
              return [fileId, { error: true } satisfies FileMetadata] as const;
            }

            const payload = (await response.json()) as Record<string, unknown>;
            const filename =
              typeof payload.filename === 'string'
                ? payload.filename
                : undefined;
            const mimeType =
              typeof payload.mime_type === 'string'
                ? payload.mime_type
                : typeof payload.media_type === 'string'
                  ? payload.media_type
                  : undefined;

            return [
              fileId,
              { filename, mimeType } satisfies FileMetadata,
            ] as const;
          } catch {
            if (abortController.signal.aborted) return null;
            return [fileId, { error: true } satisfies FileMetadata] as const;
          }
        }),
      );

      if (!isActive) return;

      const entries = results.filter((entry) => entry != null) as Array<
        readonly [string, FileMetadata]
      >;
      if (entries.length === 0) return;

      setFileMetadataById((previous) => ({
        ...previous,
        ...Object.fromEntries(entries),
      }));
    };

    fetchMetadata();

    return () => {
      isActive = false;
      abortController.abort();
    };
  }, [fileIds, fileMetadataById, isLoading]);

  // Check if result contains an error
  const hasError =
    state === 'result' &&
    result &&
    typeof result === 'object' &&
    (result.error ||
      result.isError ||
      (result.content &&
        Array.isArray(result.content) &&
        result.content.some(
          (c: any) =>
            c.type === 'text' &&
            c.text &&
            c.text.toLowerCase().includes('error'),
        )));

  if (anthropicDelegated) {
    const skillLabel = humanizeSkillToolName(toolName);
    const isWebTool = UPSTREAM_WEB_TOOL_NAMES.has(toolName);

    if (isLoading) {
      return (
        <div className="flex w-full flex-col gap-1">
          <ToolInputDebugCollapsible args={args} toolName={toolName} />
          <Task className="w-full" defaultOpen>
            <AnthropicSkillsTaskTrigger title={`${skillLabel} — in progress`} />
            <TaskContent>
              <TaskItem>
                {isWebTool
                  ? toolName === 'web_fetch'
                    ? 'Fetching the URL on the upstream Anthropic-compatible API. Results are merged into the tool payload the model sees, same as bash/code execution passthrough.'
                    : 'Searching the web on the upstream Anthropic-compatible API. Results are merged into the tool payload the model sees, same as bash/code execution passthrough.'
                  : 'Running code execution in the model environment; downloads appear here when ready.'}
              </TaskItem>
            </TaskContent>
          </Task>
        </div>
      );
    }

    if (hasError) {
      const detail = extractToolFailureDetail(result);
      return (
        <div className="flex w-full flex-col gap-1">
          <ToolInputDebugCollapsible args={args} toolName={toolName} />
          <Task className="w-full" defaultOpen>
            <AnthropicSkillsTaskTrigger title={`${skillLabel} — failed`} />
            <TaskContent>
              <TaskItem className="text-destructive">
                {isWebTool
                  ? 'Web search or fetch failed on the upstream API. See the assistant reply above for details.'
                  : 'Something went wrong while running code execution (skills / bash / editor). Check the reply above for details.'}
              </TaskItem>
              {detail ? (
                <TaskItem className="border-t border-border/50 pt-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Detail: </span>
                  <span className="whitespace-pre-wrap font-mono">
                    {detail}
                  </span>
                </TaskItem>
              ) : null}
            </TaskContent>
          </Task>
        </div>
      );
    }

    if (
      isWebTool &&
      state === 'result' &&
      result != null &&
      fileIds.length === 0
    ) {
      if (isFridaNormalizedWebToolResult(result)) {
        const citationUrls = result.sources
          .map((s) => s.url.trim())
          .filter((u) => {
            try {
              const parsed = new URL(u);
              return (
                parsed.protocol === 'http:' || parsed.protocol === 'https:'
              );
            } catch {
              return false;
            }
          });

        const structuredUi = typeof result.headlineMarkdown === 'string';

        const sourceRowsForUi =
          result.detailHits && result.detailHits.length > 0
            ? result.detailHits.map((h) => ({
                url: h.url,
                title: h.title,
                page_age: h.page_age,
              }))
            : result.sources.map((s) => ({ url: s.url, title: s.title }));

        return (
          <div className="flex w-full flex-col gap-1">
            <ToolInputDebugCollapsible args={args} toolName={toolName} />
            <Task className="w-full" defaultOpen>
              <AnthropicSkillsTaskTrigger title={`${skillLabel} — completed`} />
              <TaskContent>
                <TaskItem className="text-muted-foreground text-sm">
                  Normalized web tool result: redacted, size-capped summary plus
                  extracted links. The real search/fetch still runs on the
                  upstream API.
                </TaskItem>
              </TaskContent>
            </Task>
            <div className="space-y-3 px-0 pt-1">
              {structuredUi ? (
                <>
                  {sourceRowsForUi.length > 0 ? (
                    <>
                      <Sources className="mb-0 not-prose">
                        <SourcesTrigger count={sourceRowsForUi.length} />
                        <SourcesContent>
                          <WebSourceUrlRows items={sourceRowsForUi} />
                        </SourcesContent>
                      </Sources>
                      {citationUrls.length > 0 ? (
                        <div className="not-prose flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            Preview
                          </span>
                          <InlineCitation className="inline-flex">
                            <InlineCitationCard>
                              <InlineCitationCardTrigger
                                label={result.sources[0]?.title}
                                sources={citationUrls}
                              />
                              <InlineCitationCardBody>
                                <InlineCitationCarousel>
                                  <InlineCitationCarouselHeader>
                                    <InlineCitationCarouselPrev />
                                    <InlineCitationCarouselNext />
                                    <InlineCitationCarouselIndex />
                                  </InlineCitationCarouselHeader>
                                  <InlineCitationCarouselContent>
                                    {result.sources.map((s, i) => (
                                      <InlineCitationCarouselItem
                                        key={`${s.url}-slide-${i}`}
                                      >
                                        <InlineCitationSource
                                          title={s.title}
                                          url={s.url}
                                        />
                                      </InlineCitationCarouselItem>
                                    ))}
                                  </InlineCitationCarouselContent>
                                </InlineCitationCarousel>
                              </InlineCitationCardBody>
                            </InlineCitationCard>
                          </InlineCitation>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                  <Response proseInvertInDark className="text-foreground">
                    {result.headlineMarkdown}
                  </Response>
                  {result.detailsPlain &&
                  !(result.detailHits && result.detailHits.length > 0) ? (
                    <div className="not-prose space-y-1">
                      <p className="text-muted-foreground text-xs font-medium">
                        Details
                      </p>
                      <pre
                        className={cn(
                          'max-h-56 overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-3',
                          'whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground',
                        )}
                      >
                        {result.detailsPlain}
                      </pre>
                    </div>
                  ) : null}
                </>
              ) : (
                <>
                  <Response proseInvertInDark className="text-foreground">
                    {result.summary}
                  </Response>
                  {result.sources.length > 0 ? (
                    <>
                      <Sources className="mb-0 not-prose">
                        <SourcesTrigger count={result.sources.length} />
                        <SourcesContent>
                          <WebSourceUrlRows
                            items={result.sources.map((s) => ({
                              url: s.url,
                              title: s.title,
                            }))}
                          />
                        </SourcesContent>
                      </Sources>
                      {citationUrls.length > 0 ? (
                        <div className="not-prose flex flex-wrap items-center gap-2">
                          <span className="text-muted-foreground text-xs">
                            Preview
                          </span>
                          <InlineCitation className="inline-flex">
                            <InlineCitationCard>
                              <InlineCitationCardTrigger
                                label={result.sources[0]?.title}
                                sources={citationUrls}
                              />
                              <InlineCitationCardBody>
                                <InlineCitationCarousel>
                                  <InlineCitationCarouselHeader>
                                    <InlineCitationCarouselPrev />
                                    <InlineCitationCarouselNext />
                                    <InlineCitationCarouselIndex />
                                  </InlineCitationCarouselHeader>
                                  <InlineCitationCarouselContent>
                                    {result.sources.map((s, i) => (
                                      <InlineCitationCarouselItem
                                        key={`${s.url}-slide-${i}`}
                                      >
                                        <InlineCitationSource
                                          title={s.title}
                                          url={s.url}
                                        />
                                      </InlineCitationCarouselItem>
                                    ))}
                                  </InlineCitationCarouselContent>
                                </InlineCitationCarousel>
                              </InlineCitationCardBody>
                            </InlineCitationCard>
                          </InlineCitation>
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              )}
            </div>
          </div>
        );
      }

      const outputText = formatContent(result);
      return (
        <div className="flex w-full flex-col gap-1">
          <ToolInputDebugCollapsible args={args} toolName={toolName} />
          <Task className="w-full" defaultOpen>
            <AnthropicSkillsTaskTrigger title={`${skillLabel} — completed`} />
            <TaskContent>
              <TaskItem className="text-muted-foreground text-sm">
                Same passthrough pattern as code execution: the real run happens
                upstream; this panel shows the mirrored tool result JSON for
                debugging.
              </TaskItem>
            </TaskContent>
          </Task>
          {outputText ? (
            <Collapsible defaultOpen={false} className="group space-y-0">
              <div className="px-0 pb-0.5 pt-1 group-data-[state=closed]:px-1 group-data-[state=closed]:pb-2">
                <CollapsibleTrigger
                  className={cn(
                    'group/trigger flex w-full items-center justify-between gap-2 rounded-md border border-border/50',
                    'bg-muted/30 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground',
                    'hover:bg-muted/50 hover:text-foreground',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                >
                  <span>Tool output</span>
                  <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/trigger:rotate-180" />
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent className="outline-none data-[state=closed]:animate-out data-[state=open]:animate-in">
                <div className="px-0 pb-1">
                  <div
                    className={cn(
                      'max-h-56 overflow-y-auto rounded-md border border-border/50 bg-muted/30 p-3',
                    )}
                  >
                    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {outputText}
                    </pre>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          ) : null}
        </div>
      );
    }

    if (fileIds.length === 0) {
      return (
        <div className="flex w-full flex-col gap-1">
          <ToolInputDebugCollapsible args={args} toolName={toolName} />
        </div>
      );
    }

    return (
      <div className="flex w-full flex-col gap-1">
        <ToolInputDebugCollapsible args={args} toolName={toolName} />
        <Task className="w-full" defaultOpen>
          <AnthropicSkillsTaskTrigger
            title={`${skillLabel} — ${fileIds.length === 1 ? 'file ready' : 'files ready'}`}
          />
          <TaskContent>
            {fileIds.map((fileId) => {
              const meta = fileMetadataById[fileId];
              const filename = meta?.filename ?? fileId;
              const typeSubtitle = getGeneratedFileTypeSubtitle(
                meta?.filename,
                meta?.mimeType,
              );
              const showImage =
                meta &&
                !meta.error &&
                isRenderableAgentImage(filename, meta.mimeType);
              const imageMediaType = fileImageMediaType(
                filename,
                meta?.mimeType,
              );

              return (
                <TaskItem key={fileId}>
                  <div className="flex max-w-full flex-col gap-2 text-foreground">
                    {showImage && (
                      <GeneratedImageFromFile
                        fileId={fileId}
                        mediaType={imageMediaType}
                        alt={filename}
                      />
                    )}
                    <a
                      href={`/api/files/${encodeURIComponent(fileId)}/content`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex max-w-full flex-col items-start gap-1 text-left hover:opacity-90"
                    >
                      <TaskItemFile>
                        <FileText className="size-3.5 shrink-0 opacity-80" />
                        <span className="truncate">{filename}</span>
                      </TaskItemFile>
                      {typeSubtitle && (
                        <span className="pl-0.5 text-[10px] text-muted-foreground">
                          {typeSubtitle}
                        </span>
                      )}
                    </a>
                  </div>
                </TaskItem>
              );
            })}
          </TaskContent>
        </Task>
      </div>
    );
  }

  const SourceIcon = toolSource === 'api' ? Plug : Server;
  const badgeLabel =
    toolSource === 'mcp'
      ? serverName.length > 0
        ? `MCP · ${serverName}`
        : 'MCP'
      : 'API';

  return (
    <div className="flex w-full flex-col gap-3">
      <ToolInputDebugCollapsible args={args} toolName={toolName} />
      <Card
        className={cn(
          'w-full transition-all duration-200 border',
          hasError && 'border-destructive/50 bg-destructive/5',
        )}
      >
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <div
                className={cn(
                  'h-4 w-4 shrink-0',
                  hasError ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                <SourceIcon size={16} aria-hidden />
              </div>
              <CardTitle className="min-w-0 text-sm font-medium">
                {isLoading
                  ? toolSource === 'api'
                    ? `Calling API tool: ${toolName}...`
                    : `Calling MCP tool: ${toolName}...`
                  : hasError
                    ? `${toolName} Error`
                    : `Tool "${toolName}" completed`}
              </CardTitle>
            </div>
            <Badge
              variant={hasError ? 'destructive' : 'secondary'}
              className="max-w-[min(14rem,45%)] shrink-0 truncate text-xs"
              title={badgeLabel}
            >
              {badgeLabel}
            </Badge>
          </div>
          {description && (
            <CardDescription className="text-xs">{description}</CardDescription>
          )}
        </CardHeader>

        {displayContent && isLoading && (
          <CardContent className="pt-0">
            <div
              className={cn(
                'text-sm rounded-md p-4 max-h-48 overflow-y-auto',
                'bg-muted/50 border border-border/50',
                'text-muted-foreground',
              )}
            >
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="h-2 w-2 bg-current rounded-full animate-bounce" />
                <span className="ml-2">Processing...</span>
              </div>
            </div>
          </CardContent>
        )}

        {displayContent && !isLoading && (
          <>
            {e2bScreenshot && (
              <CardContent className="pb-3 pt-0">
                <div className="space-y-2 rounded-md border border-border/50 bg-muted/20 p-3">
                  {e2bScreenshot.note ? (
                    <p className="text-xs text-muted-foreground">
                      {e2bScreenshot.note}
                    </p>
                  ) : null}
                  <Image
                    alt="E2B desktop screenshot"
                    base64={e2bScreenshot.dataBase64}
                    className="max-h-96 w-full border border-border/40 object-contain"
                    mediaType={e2bScreenshot.mimeType}
                    uint8Array={new Uint8Array()}
                  />
                </div>
              </CardContent>
            )}
            <Collapsible defaultOpen={false} className="group space-y-0">
              <div
                className={cn(
                  'px-6 pb-0.5',
                  'group-data-[state=closed]:px-7 group-data-[state=closed]:pb-3',
                )}
              >
                <CollapsibleTrigger
                  className={cn(
                    'group/trigger flex w-full items-center justify-between gap-2 rounded-md border border-border/50',
                    'bg-muted/30 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground',
                    'group-data-[state=closed]:px-5 group-data-[state=closed]:py-3.5',
                    'hover:bg-muted/50 hover:text-foreground',
                    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  )}
                >
                  <span>Tool output</span>
                  <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/trigger:rotate-180" />
                </CollapsibleTrigger>
              </div>
              <CollapsibleContent
                className={cn(
                  'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2',
                  'outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
                )}
              >
                <CardContent className="pt-3">
                  <div
                    className={cn(
                      'text-sm rounded-md p-4 max-h-48 overflow-y-auto',
                      'bg-muted/50 border border-border/50',
                    )}
                  >
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {displayContent}
                    </pre>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </>
        )}
      </Card>

      {fileIds.length > 0 && !isLoading && (
        <GeneratedFilesDownloads
          fileIds={fileIds}
          fileMetadataById={fileMetadataById}
        />
      )}
    </div>
  );
}

export const ToolCard = memo(PureToolCard, (prevProps, nextProps) => {
  return (
    prevProps.toolName === nextProps.toolName &&
    prevProps.serverName === nextProps.serverName &&
    prevProps.toolSource === nextProps.toolSource &&
    prevProps.state === nextProps.state &&
    prevProps.result === nextProps.result &&
    prevProps.args === nextProps.args &&
    prevProps.anthropicDelegated === nextProps.anthropicDelegated
  );
});

/** @deprecated Use `ToolCard` */
export const McpToolCard = ToolCard;
