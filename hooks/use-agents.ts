'use client';

import useSWR from 'swr';
import { fetcher } from '@/lib/utils';

export type Agent = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  avatar: string;
  createdBy: string;
  isPublic: boolean;
  deployment: string;
  deployment_type: string;
  createdAt: string;
  updatedAt: string;
  // Additional fields that might be present
  knowledgeBaseIds?: any[];
  uploadedDocuments?: any[];
  modelConfig?: any;
  systemPrompt?: string;
  greetings?: Array<{
    id?: string;
    text: string;
    type?: string;
  }>;
  conversationStarters?: any[]; // Flexible schema to handle different formats
  responsibilities?: any[];
  tags?: any[];
  personalization?: any;
  risks?: any;
  mcps?: any;
  tools?: any;
};

type AgentsResponse = {
  success: boolean;
  agents: Agent[];
  error?: string;
};

export function useAgents(email?: string) {
  const { data, error, isLoading, mutate } = useSWR<AgentsResponse>(
    email ? `/api/agents?email=${encodeURIComponent(email)}` : null,
    fetcher,
    {
      revalidateOnFocus: false, // Don't refetch when window regains focus
      revalidateOnReconnect: true, // Refetch when network reconnects
      dedupingInterval: 60000, // Dedupe requests for 1 minute
      errorRetryCount: 3, // Retry failed requests up to 3 times
      errorRetryInterval: 5000, // Wait 5 seconds between retries
      refreshInterval: 0, // Don't auto-refresh
      keepPreviousData: true, // Keep previous data while loading new data
      fallbackData: { success: true, agents: [] }, // Fallback for initial load
    },
  );

  return {
    agents: data?.agents || [],
    isLoading,
    error,
    mutate, // For manual revalidation if needed
  };
}
