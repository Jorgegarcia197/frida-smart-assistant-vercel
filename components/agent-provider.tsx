'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import type { Agent } from '@/hooks/use-agents';

interface AgentContextValue {
  agentsByChatId: Record<string, Agent | null>;
  setAgentForChat: (chatId: string, agent: Agent | null) => void;
  conversationStartedByChatId: Record<string, boolean>;
  setConversationStartedForChat: (chatId: string, started: boolean) => void;
  isLoadingAgent: boolean;
  setIsLoadingAgent: React.Dispatch<React.SetStateAction<boolean>>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [agentsByChatId, setAgentsByChatId] = useState<
    Record<string, Agent | null>
  >({});
  const [conversationStartedByChatId, setConversationStartedByChatId] =
    useState<Record<string, boolean>>({});
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);

  const setAgentForChat = useCallback((chatId: string, agent: Agent | null) => {
    setAgentsByChatId((prev) => ({ ...prev, [chatId]: agent }));
  }, []);

  const setConversationStartedForChat = useCallback(
    (chatId: string, started: boolean) => {
      setConversationStartedByChatId((prev) => ({
        ...prev,
        [chatId]: started,
      }));
    },
    [],
  );

  const value = useMemo(
    () => ({
      agentsByChatId,
      setAgentForChat,
      conversationStartedByChatId,
      setConversationStartedForChat,
      isLoadingAgent,
      setIsLoadingAgent,
    }),
    [
      agentsByChatId,
      conversationStartedByChatId,
      isLoadingAgent,
      setAgentForChat,
      setConversationStartedForChat,
    ],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

function useAgentContext() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgentForChat must be used within an AgentProvider');
  }
  return context;
}

/** Agent selection and “conversation started” flags are scoped per chat id. */
export function useAgentForChat(chatId: string) {
  const {
    agentsByChatId,
    setAgentForChat,
    conversationStartedByChatId,
    setConversationStartedForChat,
    isLoadingAgent,
    setIsLoadingAgent,
  } = useAgentContext();

  const currentAgent = agentsByChatId[chatId] ?? null;

  const setCurrentAgent = useCallback(
    (agent: Agent | null) => {
      setAgentForChat(chatId, agent);
    },
    [chatId, setAgentForChat],
  );

  const hasConversationStarted =
    conversationStartedByChatId[chatId] ?? false;

  const setHasConversationStarted = useCallback(
    (started: boolean) => {
      setConversationStartedForChat(chatId, started);
    },
    [chatId, setConversationStartedForChat],
  );

  return useMemo(
    () => ({
      currentAgent,
      setCurrentAgent,
      isLoadingAgent,
      setIsLoadingAgent,
      hasConversationStarted,
      setHasConversationStarted,
    }),
    [
      currentAgent,
      setCurrentAgent,
      isLoadingAgent,
      setHasConversationStarted,
      hasConversationStarted,
    ],
  );
}
