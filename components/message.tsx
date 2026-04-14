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
import type { UseChatHelpers } from '@ai-sdk/react';
import { McpToolCard } from './mcp-tool-card';
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

/** Bedrock-safe names use `server__tool`; if absent, show full name under MCP. */
function splitMcpToolDisplayName(fullName: string): {
  serverName: string;
  shortToolName: string;
} {
  if (fullName.includes('__')) {
    const idx = fullName.indexOf('__');
    return {
      serverName: fullName.slice(0, idx),
      shortToolName: fullName.slice(idx + 2),
    };
  }
  return { serverName: 'MCP', shortToolName: fullName };
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
        'title' in item && typeof item.title === 'string' ? item.title.trim() : '';
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

            {message.parts?.map((part, index) => {
              const { type } = part;
              const key = `message-${message.id}-part-${index}`;

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
                        <Response>{sanitizeText(part.text)}</Response>
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
                  sourceValue && typeof sourceValue === 'object' && 'items' in sourceValue
                    ? normalizeAgentTaskItems(sourceValue.items)
                    : [];

                return (
                  <ChainOfThought key={toolCallId} className="w-full" defaultOpen={true}>
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
                              Mapped {(part.output as any)?.markerCount ?? 0} host location(s)
                            </div>
                          }
                          errorText={undefined}
                        />
                      )}
                    </ToolContent>
                  </Tool>
                );
              }

              // MCP / dynamic tools (incl. @ai-sdk/mcp): part.toolName, not literal `type`
              if (type === 'dynamic-tool') {
                const { state, toolCallId } = part;
                const fullToolName =
                  'toolName' in part && typeof part.toolName === 'string'
                    ? part.toolName
                    : 'unknown';
                const { serverName, shortToolName } =
                  splitMcpToolDisplayName(fullToolName);

                if (state === 'input-streaming' || state === 'input-available') {
                  return (
                    <McpToolCard
                      key={toolCallId}
                      serverName={serverName}
                      toolName={shortToolName}
                      state="call"
                      args={'input' in part ? part.input : undefined}
                      isReadonly={isReadonly}
                    />
                  );
                }

                if (state === 'output-available') {
                  return (
                    <McpToolCard
                      key={toolCallId}
                      serverName={serverName}
                      toolName={shortToolName}
                      state="result"
                      result={part.output}
                      isReadonly={isReadonly}
                    />
                  );
                }

                if (state === 'output-error') {
                  return (
                    <McpToolCard
                      key={toolCallId}
                      serverName={serverName}
                      toolName={shortToolName}
                      state="result"
                      result={{ error: part.errorText }}
                      isReadonly={isReadonly}
                    />
                  );
                }
              }
            })}

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
