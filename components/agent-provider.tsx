'use client';

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { Agent } from '@/hooks/use-agents';

interface AgentContextValue {
  currentAgent: Agent | null;
  setCurrentAgent: React.Dispatch<React.SetStateAction<Agent | null>>;
  isLoadingAgent: boolean;
  setIsLoadingAgent: React.Dispatch<React.SetStateAction<boolean>>;
  clearAgent: () => void;
  hasConversationStarted: boolean;
  setHasConversationStarted: React.Dispatch<React.SetStateAction<boolean>>;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function AgentProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [currentAgent, setCurrentAgent] = useState<Agent | null>(null);
  const [isLoadingAgent, setIsLoadingAgent] = useState(false);
  const [hasConversationStarted, setHasConversationStarted] = useState(false);

  const clearAgent = () => {
    setCurrentAgent(null);
    setHasConversationStarted(false);
  };

  const value = useMemo(
    () => ({
      currentAgent,
      setCurrentAgent,
      isLoadingAgent,
      setIsLoadingAgent,
      clearAgent,
      hasConversationStarted,
      setHasConversationStarted,
    }),
    [currentAgent, isLoadingAgent, hasConversationStarted],
  );

  return (
    <AgentContext.Provider value={value}>{children}</AgentContext.Provider>
  );
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
