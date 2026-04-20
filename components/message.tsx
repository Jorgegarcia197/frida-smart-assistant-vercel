'use client';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useMemo, useState } from 'react';
import type { Vote } from '@/lib/db/firebase-types';
import { DocumentToolResult } from './document';
import { PencilEditIcon, SparklesIcon } from './icons';
import { MessageActions } from './message-actions';
import { PreviewAttachment } from './preview-attachment';
import { Weather } from './weather';
import equal from 'fast-deep-equal';
import { cn, sanitizeText } from '@/lib/utils';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { MessageEditor } from './message-editor';
import { DocumentPreview } from './document-preview';
import { MessageReasoning } from './message-reasoning';
import { CompactionSummary } from './compaction-summary';
import { MemoryToolDisplay } from './memory-tool-display';
import type { UseChatHelpers } from '@ai-sdk/react';
import { ToolCard } from './tool-card';
import type { ChatMessage } from '@/lib/types';
import { Attachments } from './elements/attachments';
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from './elements/tool';
import { MessageContent } from './elements/message';
import { Response } from './elements/response';
import { Loader } from './elements/loader';
import { Shimmer } from './elements/shimmer';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from './elements/chain-of-thought';
import { useDataStream } from './data-stream-provider';
import { buildSpecFromParts } from '@json-render/react';
import { GenerativeUIRenderer } from '@/components/json-render/generative-ui-renderer';
import { specHasMissingChildReferences } from '@/lib/json-render/spec-has-missing-children';
import {
  AssistantTextWithBracketRefs,
  shouldUseBracketCitationRendering,
} from '@/components/assistant-bracket-citations';
import {
  collectOrderedSourceUrls,
  MessageSources,
} from '@/components/message-sources';

/**
 * MCP tools use `server__tool` ids from @ai-sdk/mcp (`collectAiSdkMcpTools`). Agent custom HTTP
 * tools use a single sanitized name (no `__`). Older chats may show `northwindmcp_execute_query`
 * because `sanitizeModelToolName` used to collapse `__` into `_` — detect that legacy shape too.
 */
function splitDynamicToolDisplayName(fullName: string): {
  serverName: string;
  shortToolName: string;
  toolSource: 'mcp' | 'api';
} {
  if (fullName.includes('__')) {
    const idx = fullName.indexOf('__');
    return {
      serverName: fullName.slice(0, idx),
      shortToolName: fullName.slice(idx + 2),
      toolSource: 'mcp',
    };
  }
  // Legacy: collapsed delimiter — agent MCP servers are often named *mcp (e.g. northwindmcp).
  const legacyMcp = /^(.+mcp)_(.+)$/i.exec(fullName);
  if (legacyMcp?.[1] && legacyMcp[2]) {
    return {
      serverName: legacyMcp[1],
      shortToolName: legacyMcp[2],
      toolSource: 'mcp',
    };
  }
  return { serverName: 'API', shortToolName: fullName, toolSource: 'api' };
}

/**
 * Anthropic passthrough tools: same pattern as `createAnthropicSkillsPassthroughTools`
 * (dynamicTool) — real work runs upstream; local `execute` mirrors JSON. These use
 * the Task-style ToolCard (`anthropicDelegated`): code execution + file downloads,
 * or web_search / web_fetch (upstream API, optional tool output panel).
 */
const ANTHROPIC_DELEGATED_TOOL_NAMES = new Set([
  'text_editor_code_execution',
  'bash_code_execution',
  'code_execution',
  'web_search',
  'web_fetch',
  '$BUILT_IN_WEB_SEARCH',
]);

function isAnthropicDelegatedToolName(fullToolName: string): boolean {
  const { shortToolName } = splitDynamicToolDisplayName(fullToolName);
  return ANTHROPIC_DELEGATED_TOOL_NAMES.has(shortToolName);
}

/** Web tools we surface before other assistant parts (after reasoning) so the UI reads search → answer. */
const ASSISTANT_WEB_TOOL_SHORT = new Set([
  'web_search',
  'web_fetch',
  '$BUILT_IN_WEB_SEARCH',
]);

function isAssistantWebToolPart(part: ChatMessage['parts'][number]): boolean {
  if (part.type !== 'dynamic-tool') return false;
  const p = part as { toolName?: string };
  if (typeof p.toolName !== 'string') return false;
  const { shortToolName } = splitDynamicToolDisplayName(p.toolName);
  return ASSISTANT_WEB_TOOL_SHORT.has(shortToolName);
}

function assistantPartDisplayRank(part: ChatMessage['parts'][number]): number {
  if (part.type === 'reasoning') return 0;
  if (isAssistantWebToolPart(part)) return 1;
  return 2;
}

/**
 * Anthropic's context-management `compact_20260112` edit emits a summary
 * block. Depending on how the gateway forwards it, the summary may arrive:
 *
 * 1. As a text part with `providerMetadata.anthropic.type === 'compaction'`
 *    (preferred, structured path).
 * 2. As a text part whose body starts with a `[compaction-summary]` marker
 *    line the gateway prepends (fallback when metadata isn't forwarded).
 *
 * Both shapes are mapped to the same `CompactionSummary` UI.
 */
function extractCompactionFromTextPart(part: {
  text?: string;
  providerMetadata?: unknown;
}): {
  text: string;
  meta?: { originalTokens?: number; compactedTokens?: number };
} | null {
  const rawMeta =
    part.providerMetadata && typeof part.providerMetadata === 'object'
      ? ((part.providerMetadata as Record<string, unknown>).anthropic as
          | Record<string, unknown>
          | undefined)
      : undefined;

  if (rawMeta && rawMeta.type === 'compaction') {
    const originalTokens =
      typeof rawMeta.originalTokens === 'number'
        ? rawMeta.originalTokens
        : typeof rawMeta.original_tokens === 'number'
          ? (rawMeta.original_tokens as number)
          : undefined;
    const compactedTokens =
      typeof rawMeta.compactedTokens === 'number'
        ? rawMeta.compactedTokens
        : typeof rawMeta.compacted_tokens === 'number'
          ? (rawMeta.compacted_tokens as number)
          : undefined;
    return {
      text: part.text ?? '',
      meta:
        originalTokens != null || compactedTokens != null
          ? { originalTokens, compactedTokens }
          : undefined,
    };
  }

  const text = part.text ?? '';
  // Marker fallback — supports streaming: body may grow after the first line.
  if (/^\s*\[compaction-summary\]/i.test(text)) {
    const rest = text.replace(/^\s*\[compaction-summary\][^\n]*\n?/i, '');
    return { text: rest };
  }

  return null;
}

function isAnthropicCodeExecutionToolType(type: string): boolean {
  return (
    type === 'tool-text_editor_code_execution' ||
    type === 'tool-bash_code_execution' ||
    type === 'tool-code_execution'
  );
}

function getAnthropicCodeExecutionToolName(type: string): string {
  if (type === 'tool-text_editor_code_execution') {
    return 'text_editor_code_execution';
  }
  if (type === 'tool-bash_code_execution') {
    return 'bash_code_execution';
  }
  if (type === 'tool-code_execution') {
    return 'code_execution';
  }
  return type.replace(/^tool-/, '');
}

type AgentTaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

type AgentTaskItem = {
  id: string;
  title: string;
  status: AgentTaskStatus;
};

function normalizeAgentTaskItems(value: unknown): AgentTaskItem[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const title =
        'title' in item && typeof item.title === 'string'
          ? item.title.trim()
          : '';
      const status = 'status' in item ? item.status : undefined;

      if (
        !title ||
        (status !== 'pending' &&
          status !== 'in_progress' &&
          status !== 'completed' &&
          status !== 'failed')
      ) {
        return null;
      }

      const id =
        'id' in item && typeof item.id === 'string' && item.id.trim().length > 0
          ? item.id.trim()
          : `task-${index + 1}`;

      return { id, title, status };
    })
    .filter((item): item is AgentTaskItem => item !== null);
}

function getTaskTitleFromValue(value: unknown): string {
  if (!value || typeof value !== 'object') {
    return 'Working plan';
  }

  const candidate = 'title' in value ? value.title : undefined;
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : 'Working plan';
}

function getTaskStatusLabel(status: AgentTaskStatus): string {
  switch (status) {
    case 'completed':
      return 'Completed';
    case 'in_progress':
      return 'In progress';
    case 'failed':
      return 'Failed';
    case 'pending':
    default:
      return 'Pending';
  }
}

function toChainOfThoughtStatus(
  status: AgentTaskStatus,
): 'active' | 'complete' | 'pending' {
  switch (status) {
    case 'completed':
      return 'complete';
    case 'in_progress':
    case 'failed':
      return 'active';
    case 'pending':
    default:
      return 'pending';
  }
}

const PurePreviewMessage = ({
  chatId,
  message,
  vote,
  isLoading,
  setMessages,
  regenerate,
  isReadonly,
  requiresScrollPadding,
  isArtifactVisible,
}: {
  chatId: string;
  message: ChatMessage;
  vote: Vote | undefined;
  isLoading: boolean;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  requiresScrollPadding: boolean;
  isArtifactVisible: boolean;
}) => {
  const [mode, setMode] = useState<'view' | 'edit'>('view');

  const attachmentsFromMessage = message.parts.filter(
    (part) => part.type === 'file',
  );

  useDataStream();

  const lastDataSpecPartIndex = useMemo(() => {
    let last = -1;
    message.parts?.forEach((p, i) => {
      if (p.type === 'data-spec') {
        last = i;
      }
    });
    return last;
  }, [message.parts]);

  const orderedAssistantSourceUrls = useMemo(
    () => collectOrderedSourceUrls(message),
    [message],
  );

  const displayParts = useMemo(() => {
    const parts = message.parts;
    if (!parts?.length) {
      return [] as Array<{ p: ChatMessage['parts'][number]; i: number }>;
    }
    if (message.role !== 'assistant') {
      return parts.map((p, i) => ({ p, i }));
    }
    return [...parts]
      .map((p, i) => ({ p, i }))
      .sort((a, b) => {
        const ra = assistantPartDisplayRank(a.p);
        const rb = assistantPartDisplayRank(b.p);
        if (ra !== rb) return ra - rb;
        return a.i - b.i;
      });
  }, [message.parts, message.role]);

  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn('flex items-start gap-3', {
            'w-full': mode === 'edit',
            'max-w-xl ml-auto justify-end mr-6':
              message.role === 'user' && mode !== 'edit',
            'justify-start -ml-3': message.role === 'assistant',
          })}
        >
          {message.role === 'assistant' && (
            <div className="flex justify-center items-center mt-1 rounded-full ring-1 size-8 shrink-0 ring-border bg-background">
              <SparklesIcon size={14} />
            </div>
          )}

          <div
            className={cn('flex flex-col gap-4', {
              'min-h-96': message.role === 'assistant' && requiresScrollPadding,
              'w-fit': message.role === 'user',
              'w-full': message.role === 'assistant' || mode === 'edit',
              'min-w-0': message.role === 'assistant',
            })}
          >
            {attachmentsFromMessage.length > 0 && (
              <Attachments
                data-testid={`message-attachments`}
                className="justify-end"
                variant="grid"
              >
                {attachmentsFromMessage.map((attachment) => (
                  <PreviewAttachment
                    key={attachment.url}
                    attachment={{
                      name: attachment.filename ?? 'file',
                      contentType: attachment.mediaType,
                      url: attachment.url,
                    }}
                  />
                ))}
              </Attachments>
            )}

            {message.role === 'assistant' && (
              <MessageSources message={message} />
            )}

            {displayParts.map(({ p: part, i: index }) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

              if (
                message.role === 'assistant' &&
                (type === 'source-url' || type === 'source-document')
              ) {
                return null;
              }

              if (type === 'reasoning' && part.text?.trim().length > 0) {
                return (
                  <MessageReasoning
                    key={key}
                    isLoading={isLoading}
                    reasoning={part.text}
                  />
                );
              }

              if (message.role === 'assistant' && type === 'data-spec') {
                if (index !== lastDataSpecPartIndex) {
                  return null;
                }
                const spec = buildSpecFromParts(message.parts ?? []);
                return (
                  <div key={key} className="min-w-0 w-full">
                    <GenerativeUIRenderer
                      spec={spec}
                      loading={
                        isLoading ||
                        (spec ? specHasMissingChildReferences(spec) : false)
                      }
                    />
                  </div>
                );
              }

              if (type === 'text') {
                const compaction =
                  message.role === 'assistant'
                    ? extractCompactionFromTextPart(part as any)
                    : null;
                if (compaction) {
                  const isLastPart = index === (message.parts?.length ?? 0) - 1;
                  const compactionStreaming =
                    isLoading && message.role === 'assistant' && isLastPart;
                  return (
                    <CompactionSummary
                      key={key}
                      text={compaction.text}
                      meta={compaction.meta}
                      isStreaming={compactionStreaming}
                    />
                  );
                }

                if (mode === 'view') {
                  return (
                    <div key={key} className="flex flex-row gap-2 items-start">
                      {message.role === 'user' && !isReadonly && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              data-testid="message-edit-button"
                              variant="ghost"
                              className="px-2 h-fit rounded-full text-muted-foreground opacity-0 group-hover/message:opacity-100"
                              onClick={() => {
                                setMode('edit');
                              }}
                            >
                              <PencilEditIcon />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit message</TooltipContent>
                        </Tooltip>
                      )}

                      <MessageContent
                        data-testid="message-content"
                        className={cn('justify-start items-start text-left', {
                          'bg-primary text-primary-foreground':
                            message.role === 'user',
                          'bg-transparent -ml-4': message.role === 'assistant',
                        })}
                      >
                        {message.role === 'assistant' &&
                        shouldUseBracketCitationRendering(
                          part.text ?? '',
                          orderedAssistantSourceUrls,
                        ) ? (
                          <AssistantTextWithBracketRefs
                            text={part.text ?? ''}
                            sources={orderedAssistantSourceUrls}
                            proseInvertInDark
                          />
                        ) : (
                          <Response
                            proseInvertInDark={message.role !== 'user'}
                            className={
                              message.role === 'user'
                                ? 'text-primary-foreground [&_*]:text-primary-foreground'
                                : undefined
                            }
                          >
                            {sanitizeText(part.text)}
                          </Response>
                        )}
                      </MessageContent>
                    </div>
                  );
                }

                if (mode === 'edit') {
                  return (
                    <div
                      key={key}
                      className="flex flex-row gap-3 items-start w-full"
                    >
                      <div className="size-8" />
                      <div className="flex-1 min-w-0 ">
                        <MessageEditor
                          key={message.id}
                          message={message}
                          setMode={setMode}
                          setMessages={setMessages}
                          regenerate={regenerate}
                        />
                      </div>
                    </div>
                  );
                }
              }

              if (type === 'tool-getWeather') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-getWeather" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={part.input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={<Weather weatherAtLocation={part.output} />}
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }
              if (type === 'tool-createDocument') {
                const { toolCallId } = part;

                if (part.output && 'error' in part.output) {
                  return (
                    <div
                      key={toolCallId}
                      className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/50"
                    >
                      Error creating document: {String(part.output.error)}
                    </div>
                  );
                }

                return (
                  <DocumentPreview
                    key={toolCallId}
                    isReadonly={isReadonly}
                    result={part.output}
                  />
                );
              }

              if (type === 'tool-createMermaidDiagram') {
                const { toolCallId, output } = part;

                if (output && 'error' in output) {
                  return (
                    <div
                      key={toolCallId}
                      className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/50"
                    >
                      Error creating diagram: {String(output.error)}
                    </div>
                  );
                }

                return (
                  <DocumentPreview
                    key={toolCallId}
                    isReadonly={isReadonly}
                    result={output}
                  />
                );
              }

              if (type === 'tool-createIshikawaDiagram') {
                const { toolCallId, output } = part;

                if (output && 'error' in output) {
                  return (
                    <div
                      key={toolCallId}
                      className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/50"
                    >
                      Error creating Ishikawa diagram: {String(output.error)}
                    </div>
                  );
                }

                return (
                  <DocumentPreview
                    key={toolCallId}
                    isReadonly={isReadonly}
                    result={output}
                  />
                );
              }

              if (type === 'tool-updateDocument') {
                const { toolCallId } = part;

                if (part.output && 'error' in part.output) {
                  return (
                    <div
                      key={toolCallId}
                      className="p-4 text-red-500 bg-red-50 rounded-lg border border-red-200 dark:bg-red-950/50"
                    >
                      Error updating document: {String(part.output.error)}
                    </div>
                  );
                }

                return (
                  <div key={toolCallId} className="relative">
                    <DocumentPreview
                      isReadonly={isReadonly}
                      result={part.output}
                      args={{ ...part.output, isUpdate: true }}
                    />
                  </div>
                );
              }

              if (type === 'tool-requestSuggestions') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-requestSuggestions" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={part.input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            'error' in part.output ? (
                              <div className="p-2 text-red-500 rounded border">
                                Error: {String(part.output.error)}
                              </div>
                            ) : (
                              <DocumentToolResult
                                type="request-suggestions"
                                result={part.output}
                                isReadonly={isReadonly}
                              />
                            )
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (type === 'tool-updateAgentTasks') {
                const { toolCallId, state } = part;
                const sourceValue =
                  state === 'output-available' ? part.output : part.input;
                const taskTitle = getTaskTitleFromValue(sourceValue);
                const taskItems =
                  sourceValue &&
                  typeof sourceValue === 'object' &&
                  'items' in sourceValue
                    ? normalizeAgentTaskItems(sourceValue.items)
                    : [];

                return (
                  <ChainOfThought
                    key={toolCallId}
                    className="w-full"
                    defaultOpen={true}
                  >
                    <ChainOfThoughtHeader>{taskTitle}</ChainOfThoughtHeader>
                    <ChainOfThoughtContent>
                      {taskItems.length > 0 ? (
                        taskItems.map((item) => (
                          <ChainOfThoughtStep
                            key={item.id}
                            description={getTaskStatusLabel(item.status)}
                            label={item.title}
                            status={toChainOfThoughtStatus(item.status)}
                          />
                        ))
                      ) : (
                        <ChainOfThoughtStep
                          label="Preparing task list..."
                          status="active"
                        />
                      )}
                    </ChainOfThoughtContent>
                  </ChainOfThought>
                );
              }

              if (type === 'tool-renderHostMap') {
                const { toolCallId, state } = part;

                return (
                  <Tool key={toolCallId} defaultOpen={true}>
                    <ToolHeader type="tool-renderHostMap" state={state} />
                    <ToolContent>
                      {state === 'input-available' && (
                        <ToolInput input={part.input} />
                      )}
                      {state === 'output-available' && (
                        <ToolOutput
                          output={
                            <div className="text-sm text-muted-foreground">
                              Mapped {(part.output as any)?.markerCount ?? 0}{' '}
                              host location(s)
                            </div>
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              if (isAnthropicCodeExecutionToolType(type)) {
                const toolPart = part as {
                  toolCallId: string;
                  state:
                    | 'input-streaming'
                    | 'input-available'
                    | 'output-available'
                    | 'output-error'
                    | string;
                  input?: unknown;
                  output?: unknown;
                  errorText?: string;
                };
                const toolName = getAnthropicCodeExecutionToolName(type);

                if (
                  toolPart.state === 'input-streaming' ||
                  toolPart.state === 'input-available'
                ) {
                  return (
                    <ToolCard
                      key={toolPart.toolCallId}
                      serverName="Anthropic Skills"
                      toolName={toolName}
                      state="call"
                      args={toolPart.input}
                      isReadonly={isReadonly}
                      anthropicDelegated
                    />
                  );
                }

                if (toolPart.state === 'output-available') {
                  return (
                    <ToolCard
                      key={toolPart.toolCallId}
                      serverName="Anthropic Skills"
                      toolName={toolName}
                      state="result"
                      args={toolPart.input}
                      result={toolPart.output}
                      isReadonly={isReadonly}
                      anthropicDelegated
                    />
                  );
                }

                if (toolPart.state === 'output-error') {
                  return (
                    <ToolCard
                      key={toolPart.toolCallId}
                      serverName="Anthropic Skills"
                      toolName={toolName}
                      state="result"
                      args={toolPart.input}
                      result={{ error: toolPart.errorText }}
                      isReadonly={isReadonly}
                      anthropicDelegated
                    />
                  );
                }
              }

              // MCP / dynamic tools (incl. @ai-sdk/mcp): part.toolName, not literal `type`
              if (type === 'dynamic-tool') {
                const { state, toolCallId } = part;
                const fullToolName =
                  'toolName' in part && typeof part.toolName === 'string'
                    ? part.toolName
                    : 'unknown';
                const { serverName, shortToolName, toolSource } =
                  splitDynamicToolDisplayName(fullToolName);
                const anthropicDelegated =
                  isAnthropicDelegatedToolName(fullToolName);

                if (shortToolName === 'memory') {
                  if (
                    state === 'input-streaming' ||
                    state === 'input-available'
                  ) {
                    return (
                      <MemoryToolDisplay
                        key={toolCallId}
                        state="call"
                        input={'input' in part ? part.input : undefined}
                      />
                    );
                  }
                  if (state === 'output-available') {
                    return (
                      <MemoryToolDisplay
                        key={toolCallId}
                        state="result"
                        input={'input' in part ? part.input : undefined}
                        output={part.output}
                      />
                    );
                  }
                  if (state === 'output-error') {
                    return (
                      <MemoryToolDisplay
                        key={toolCallId}
                        state="error"
                        errorText={part.errorText}
                      />
                    );
                  }
                }

                if (
                  state === 'input-streaming' ||
                  state === 'input-available'
                ) {
                  return (
                    <ToolCard
                      key={toolCallId}
                      serverName={serverName}
                      toolName={shortToolName}
                      toolSource={toolSource}
                      state="call"
                      args={'input' in part ? part.input : undefined}
                      isReadonly={isReadonly}
                      anthropicDelegated={anthropicDelegated}
                    />
                  );
                }

                if (state === 'output-available') {
                  return (
                    <ToolCard
                      key={toolCallId}
                      serverName={serverName}
                      toolName={shortToolName}
                      toolSource={toolSource}
                      state="result"
                      args={'input' in part ? part.input : undefined}
                      result={part.output}
                      isReadonly={isReadonly}
                      anthropicDelegated={anthropicDelegated}
                    />
                  );
                }

                if (state === 'output-error') {
                  return (
                    <ToolCard
                      key={toolCallId}
                      serverName={serverName}
                      toolName={shortToolName}
                      toolSource={toolSource}
                      state="result"
                      args={'input' in part ? part.input : undefined}
                      result={{ error: part.errorText }}
                      isReadonly={isReadonly}
                      anthropicDelegated={anthropicDelegated}
                    />
                  );
                }
              }
            })}

            {message.role === 'assistant' && isLoading && (
              <div
                className="flex items-center gap-2 text-muted-foreground -ml-4"
                aria-busy="true"
                aria-live="polite"
              >
                <Loader size={16} className="shrink-0" />
                <span className="sr-only">Assistant is still generating</span>
              </div>
            )}

            {!isReadonly && (
              <MessageActions
                key={`action-${message.id}`}
                chatId={chatId}
                message={message}
                vote={vote}
                isLoading={isLoading}
              />
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export const PreviewMessage = memo(
  PurePreviewMessage,
  (prevProps, nextProps) => {
    if (prevProps.isLoading !== nextProps.isLoading) return false;
    if (prevProps.message.id !== nextProps.message.id) return false;
    if (prevProps.requiresScrollPadding !== nextProps.requiresScrollPadding)
      return false;
    if (!equal(prevProps.message.parts, nextProps.message.parts)) return false;
    if (!equal(prevProps.vote, nextProps.vote)) return false;

    return false;
  },
);

export const ThinkingMessage = () => {
  const role = 'assistant';

  return (
    <motion.div
      data-testid="message-assistant-loading"
      className="w-full mx-auto max-w-3xl px-4 group/message min-h-96"
      initial={{ y: 5, opacity: 0 }}
      animate={{ y: 0, opacity: 1, transition: { delay: 1 } }}
      data-role={role}
    >
      <div
        className={cx(
          'flex gap-4 group-data-[role=user]/message:px-3 w-full group-data-[role=user]/message:w-fit group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl group-data-[role=user]/message:py-2 rounded-xl',
          {
            'group-data-[role=user]/message:bg-muted': true,
          },
        )}
      >
        <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border">
          <SparklesIcon size={14} />
        </div>

        <div className="flex flex-col gap-2 w-full">
          <div className="flex flex-col gap-4 text-muted-foreground">
            <Shimmer className="text-muted-foreground">Thinking ...</Shimmer>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
