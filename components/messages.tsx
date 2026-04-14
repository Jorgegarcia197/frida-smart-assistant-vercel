import { ThinkingMessage } from './message';
import { Greeting } from './greeting';
import type { Vote } from '@/lib/db/firebase-types';
import type { UseChatHelpers } from '@ai-sdk/react';
import { motion } from 'framer-motion';
import { useMessages } from '@/hooks/use-messages';
import type { ChatMessage } from '@/lib/types';
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from './elements/conversation';
import { VirtualizedMessageList } from './virtualized-message-list';

interface MessagesProps {
  chatId: string;
  status: UseChatHelpers<ChatMessage>['status'];
  votes: Array<Vote> | undefined;
  messages: ChatMessage[];
  setMessages: UseChatHelpers<ChatMessage>['setMessages'];
  regenerate: UseChatHelpers<ChatMessage>['regenerate'];
  isReadonly: boolean;
  isArtifactVisible: boolean;
}

export function Messages({
  chatId,
  status,
  votes,
  messages,
  setMessages,
  regenerate,
  isReadonly,
  isArtifactVisible,
}: MessagesProps) {
  const {
    containerRef: messagesContainerRef,
    endRef: messagesEndRef,
    onViewportEnter,
    onViewportLeave,
    hasSentMessage,
  } = useMessages({
    chatId,
    status,
  });

  return (
    <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
      <Conversation className="flex flex-col min-w-0 gap-6 pt-4 px-4 max-w-4xl mx-auto">
        <ConversationContent className="flex flex-col gap-6">
          {messages.length === 0 && <Greeting chatId={chatId} />}

          {messages.length > 0 && (
            <VirtualizedMessageList
              chatId={chatId}
              messages={messages}
              status={status}
              votes={votes}
              setMessages={setMessages}
              regenerate={regenerate}
              isReadonly={isReadonly}
              isArtifactVisible={isArtifactVisible}
              hasSentMessage={hasSentMessage}
            />
          )}

          {status === 'submitted' &&
            messages.length > 0 &&
            messages[messages.length - 1].role === 'user' && (
              <ThinkingMessage />
            )}

          <motion.div
            ref={messagesEndRef}
            className="shrink-0 min-w-[24px] min-h-[24px]"
            onViewportLeave={onViewportLeave}
            onViewportEnter={onViewportEnter}
          />
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}
