'use client';

import cx from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import { memo, useState } from 'react';
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

  /* FIXME(@ai-sdk-upgrade-v5): The `experimental_attachments` property has been replaced with the parts array. Please manually migrate following https://ai-sdk.dev/docs/migration-guides/migration-guide-5-0#attachments--file-parts */
  return (
    <AnimatePresence>
      <motion.div
        data-testid={`message-${message.role}`}
        className="w-full mx-auto max-w-3xl px-4 group/message"
        initial={{ y: 5, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        data-role={message.role}
      >
        <div
          className={cn(
            'flex gap-4 w-full group-data-[role=user]/message:ml-auto group-data-[role=user]/message:max-w-2xl',
            {
              'w-full': mode === 'edit',
              'group-data-[role=user]/message:w-fit': mode !== 'edit',
            },
          )}
        >
          {message.role === 'assistant' && (
            <div className="size-8 flex items-center rounded-full justify-center ring-1 shrink-0 ring-border bg-background">
              <div className="translate-y-px">
                <SparklesIcon size={14} />
              </div>
            </div>
          )}

          <div
            className={cn('flex flex-col gap-4 w-full', {
              'min-h-96': message.role === 'assistant' && requiresScrollPadding,
            })}
          >
            {message.experimental_attachments &&
              message.experimental_attachments.length > 0 && (
                <div
                  data-testid={`message-attachments`}
                  className="flex flex-row justify-end gap-2"
                >
                  {message.experimental_attachments.map((attachment) => (
                    <PreviewAttachment
                      key={attachment.url}
                      attachment={attachment}
                    />
                  ))}
                </div>
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
                        hello={world}
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
                      <div className="flex-1 min-w-0">
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

              // Is a MCP Tool
              if (type.startsWith('tool-') && type.includes('__')) {
                const { toolName, toolCallId, state } = part;

                if (state === 'call') {
                  <McpToolCard
                    serverName={toolName.split('__')[0]}
                    toolName={toolName}
                    state="call"
                    args={args}
                    isReadonly={isReadonly}
                  />;
                } else if (state === 'result') {
                  <McpToolCard
                    serverName={toolName.split('__')[0]}
                    toolName={toolName}
                    state="result"
                    result={
                      'The tool was executed successfully! Check the result below.'
                    }
                    isReadonly={isReadonly}
                  />;
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

    return true;
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
            Thinking ...
          </div>
        </div>
      </div>
    </motion.div>
  );
};
