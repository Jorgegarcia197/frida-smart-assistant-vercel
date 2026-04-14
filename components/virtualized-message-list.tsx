'use client';

import { useVirtualizer } from '@tanstack/react-virtual';
import { useStickToBottomContext } from 'use-stick-to-bottom';
import { PreviewMessage } from './message';
import type { Vote } from '@/lib/db/firebase-types';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { ChatMessage } from '@/lib/types';
import { cn } from '@/lib/utils';

export type VirtualizedMessageListProps = {
  chatId: string;
  messages: ChatMessage[];
  status: UseChatHelpers<ChatMessage>['status'];
  votes: Array<Vote> | undefined;
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  isArtifactVisible: boolean;
  hasSentMessage: boolean;
};

/**
 * Renders only visible rows so long threads stay responsive. Must be used
 * inside {@link Conversation} / StickToBottom so the scroll element matches
 * stick-to-bottom behavior.
 */
export function VirtualizedMessageList({
  chatId,
  messages,
  status,
  votes,
  setMessages,
  regenerate,
  isReadonly,
  isArtifactVisible,
  hasSentMessage,
}: VirtualizedMessageListProps) {
  const { scrollRef } = useStickToBottomContext();

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 200,
    overscan: 8,
    getItemKey: (index) => messages[index]?.id ?? index,
  });

  const items = virtualizer.getVirtualItems();

  return (
    <div
      className="w-full"
      style={{
        height: virtualizer.getTotalSize(),
        position: 'relative',
      }}
    >
      {items.map((virtualRow) => {
        const index = virtualRow.index;
        const message = messages[index];
        if (!message) {
          return null;
        }
        const isLast = index === messages.length - 1;

        return (
          <div
            key={message.id}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            className={cn('absolute top-0 left-0 w-full', !isLast && 'pb-6')}
            style={{
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <PreviewMessage
              chatId={chatId}
              message={message}
              isLoading={status === 'streaming' && isLast}
              vote={
                votes
                  ? votes.find((vote) => vote.messageId === message.id)
                  : undefined
              }
              setMessages={setMessages}
              regenerate={regenerate}
              isReadonly={isReadonly}
              requiresScrollPadding={hasSentMessage && isLast}
              isArtifactVisible={isArtifactVisible}
            />
          </div>
        );
      })}
    </div>
  );
}
