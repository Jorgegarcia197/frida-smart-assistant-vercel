'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useRef, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote } from '@/lib/db/firebase-types';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';
import type { Attachment, ChatMessage } from '@/lib/types';
import { useDataStream } from './data-stream-provider';
import { DefaultChatTransport } from 'ai';
import { useAgent } from './agent-provider';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
  initialAgentData,
}: {
  id: string;
  initialMessages: ChatMessage[];
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
  initialAgentData?: {
    agentId?: string;
    agentSystemPrompt?: string;
    agentResponsibilities?: string[];
    agentMcpConfig?: any;
    agentKnowledgeBaseIds?: string[];
  };
}) {
  const { mutate } = useSWRConfig();
  const { setDataStream } = useDataStream();
  const { currentAgent } = useAgent();

  // Debug logging for agent context
  console.log('🔧 Chat component - currentAgent from context:', currentAgent);
  console.log(
    '🔧 Chat component - currentAgent systemPrompt:',
    currentAgent?.systemPrompt,
  );
  console.log(
    '🔧 Chat component - currentAgent responsibilities:',
    currentAgent?.responsibilities,
  );

  // Create a stable reference to agent data that won't change during the request
  const agentDataRef = useRef<{
    agentSystemPrompt?: string;
    agentResponsibilities?: string[];
    agentMcpConfig?: any;
    agentKnowledgeBaseIds?: string[];
  }>({});

  // Update the ref whenever currentAgent changes
  useEffect(() => {
    if (currentAgent) {
      agentDataRef.current = {
        agentSystemPrompt: currentAgent.systemPrompt,
        agentResponsibilities: currentAgent.responsibilities,
        agentMcpConfig: currentAgent.mcps,
        agentKnowledgeBaseIds: currentAgent.knowledgeBaseIds,
      };
      console.log('🔧 Agent data ref updated:', agentDataRef.current);
    }
  }, [currentAgent]);

  const [input, setInput] = useState<string>('');

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const {
    messages,
    regenerate,
    resumeStream,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<ChatMessage>({
    id,
    messages: initialMessages,
    experimental_throttle: 100,
    generateId: generateUUID,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      fetch: fetchWithErrorHandlers,
      prepareSendMessagesRequest({ messages, id }) {
        console.log('🔧 prepareSendMessagesRequest called!');
        console.log('🔧 Current agent:', currentAgent);
        console.log('🔧 Initial agent data:', initialAgentData);
        console.log('🔧 Agent data ref:', agentDataRef.current);

        // Use agentDataRef if it has data, otherwise fall back to initialAgentData
        const agentData =
          Object.keys(agentDataRef.current).length > 0
            ? agentDataRef.current
            : initialAgentData
              ? {
                  agentSystemPrompt: initialAgentData.agentSystemPrompt,
                  agentResponsibilities: initialAgentData.agentResponsibilities,
                  agentMcpConfig: initialAgentData.agentMcpConfig,
                  agentKnowledgeBaseIds: initialAgentData.agentKnowledgeBaseIds,
                }
              : {};

        console.log('🔧 Agent data being sent:', agentData);

        const requestBody = {
          id,
          message: messages.at(-1),
          selectedChatModel: initialChatModel,
          selectedVisibilityType: visibilityType,
          ...agentData,
        };

        console.log(
          '🔧 Final request body:',
          JSON.stringify(requestBody, null, 2),
        );

        return {
          body: requestBody,
        };
      },
    }),
    onData: (dataPart) => {
      setDataStream((ds) => (ds ? [...ds, dataPart] : []));
    },
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      sendMessage({
        role: 'user' as const,
        parts: [{ type: 'text', text: query }],
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, sendMessage, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    resumeStream,
    setMessages,
  });

  return (
    <>
      <div className="flex flex-col min-w-0 h-dvh bg-background">
        <ChatHeader
          chatId={id}
          selectedVisibilityType={initialVisibilityType}
          isReadonly={isReadonly}
          session={session}
        />

        <Messages
          chatId={id}
          status={status}
          votes={votes}
          messages={messages}
          setMessages={setMessages}
          regenerate={regenerate}
          isReadonly={isReadonly}
          isArtifactVisible={isArtifactVisible}
        />

        <div className="sticky bottom-0 flex gap-2 px-4 pb-4 mx-auto w-full bg-background md:pb-6 md:max-w-4xl z-[1] border-t-0">
          {!isReadonly && (
            <MultimodalInput
              attachments={attachments}
              chatId={id}
              input={input}
              messages={messages}
              selectedModelId={initialChatModel}
              selectedVisibilityType={visibilityType}
              sendMessage={sendMessage}
              setAttachments={setAttachments}
              setInput={setInput}
              setMessages={setMessages}
              status={status}
              stop={stop}
            />
          )}
        </div>
      </div>

      <Artifact
        attachments={attachments}
        chatId={id}
        input={input}
        isReadonly={isReadonly}
        messages={messages}
        regenerate={regenerate}
        selectedModelId={initialChatModel}
        selectedVisibilityType={visibilityType}
        sendMessage={sendMessage}
        setAttachments={setAttachments}
        setInput={setInput}
        setMessages={setMessages}
        status={status}
        stop={stop}
        votes={votes}
      />
    </>
  );
}
