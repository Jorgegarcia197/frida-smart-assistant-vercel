'use client';

import { useSession } from 'next-auth/react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { toast } from 'sonner';
import { useState } from 'react';
import { X, Bot, Loader2, RefreshCw } from 'lucide-react';
import { useAgent } from './agent-provider';
import { useAgents } from '@/hooks/use-agents';

type LoadAgentContentProps = {
  setIsLoadAgentOpen: (isOpen: boolean) => void;
};

const LoadAgentContent = ({ setIsLoadAgentOpen }: LoadAgentContentProps) => {
  const { data: session } = useSession();
  const { setCurrentAgent, setIsLoadingAgent, isLoadingAgent, currentAgent } =
    useAgent();
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  // Use the cached agents hook
  const { agents, isLoading, error, mutate } = useAgents(
    session?.user?.email || undefined,
  );

  // Handle errors from the API
  if (error) {
    console.error('Error fetching agents:', error);
    toast.error('Failed to load agents');
  }

  const handleLoadAgent = async () => {
    if (!selectedAgentId) {
      toast.error('Please select an agent to load');
      return;
    }

    setIsLoadingAgent(true);

    try {
      const selectedAgent = agents.find(
        (agent) => agent.id === selectedAgentId,
      );

      if (selectedAgent) {
        console.log('🔧 Loading agent:', selectedAgent);
        console.log('🔧 Agent systemPrompt:', selectedAgent.systemPrompt);
        console.log(
          '🔧 Agent responsibilities:',
          selectedAgent.responsibilities,
        );

        // Set the agent in the context
        setCurrentAgent(selectedAgent);
        toast.success(`Agent "${selectedAgent.name}" loaded successfully`);
        setIsLoadAgentOpen(false);
        setSelectedAgentId('');
      }
    } catch (error) {
      console.error('Error loading agent:', error);
      toast.error('Failed to load agent');
    } finally {
      setIsLoadingAgent(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex gap-2 items-center">
          <Bot className="size-4" />
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            Load Agent
          </h2>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              mutate(); // Refresh agents cache
              toast.info('Refreshing agents...');
            }}
            className="size-8"
            disabled={isLoading}
          >
            <RefreshCw
              className={`size-4 ${isLoading ? 'animate-spin' : ''}`}
            />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              setIsLoadAgentOpen(false);
            }}
            className="size-8"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 p-4 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Loading your agents...
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <div className="relative">
              <div className="rounded-full bg-muted p-6">
                <Bot className="size-12 text-muted-foreground" />
              </div>
            </div>

            <div className="space-y-2 max-w-sm">
              <h3 className="text-lg font-semibold">No Agents Available</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                You don&apos;t have any agents configured yet. Create your first
                agent to get started!
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Select an agent to load into your current session
                </h3>
                <p className="text-xs text-muted-foreground">
                  Choose from your available agents to enhance your chat
                  experience
                </p>
              </div>

              <div className="flex flex-col h-full space-y-3">
                <div className="space-y-2">
                  <Label className="text-sm">
                    Available Agents ({agents.length})
                  </Label>
                  <div className="flex-1 overflow-y-auto border rounded-md bg-muted/30">
                    {agents.map((agent) => (
                      <Card
                        key={agent.id}
                        className={`m-2 cursor-pointer transition-all hover:shadow-md ${
                          selectedAgentId === agent.id
                            ? 'ring-2 ring-primary bg-primary/5'
                            : currentAgent?.id === agent.id
                              ? 'ring-2 ring-green-500 bg-green-50 dark:bg-green-950/20'
                              : 'hover:bg-background'
                        }`}
                        onClick={() => setSelectedAgentId(agent.id)}
                      >
                        <CardContent className="p-3">
                          <div className="flex flex-col space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">
                                {agent.name}
                              </span>
                              <div className="flex items-center gap-2">
                                {currentAgent?.id === agent.id && (
                                  <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded font-medium">
                                    Active
                                  </span>
                                )}
                                <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                                  {agent.deployment_type}
                                </span>
                              </div>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {agent.shortName}
                            </span>
                            {agent.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {agent.description}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    handleLoadAgent();
                  }}
                  className="w-full"
                  disabled={!selectedAgentId || isLoadingAgent}
                >
                  {isLoadingAgent ? (
                    <>
                      <Loader2 className="size-4 mr-2 animate-spin" />
                      Loading Agent...
                    </>
                  ) : (
                    'Load Agent'
                  )}
                </Button>
              </div>
            </div>

            {/* Agent Details */}
            {selectedAgentId && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-medium text-sm mb-2">Agent Details</h4>
                {(() => {
                  const agent = agents.find((a) => a.id === selectedAgentId);
                  return agent ? (
                    <div className="space-y-2">
                      <div>
                        <span className="text-sm font-medium">Name:</span>
                        <span className="text-sm ml-2">{agent.name}</span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Short Name:</span>
                        <span className="text-sm ml-2 text-muted-foreground">
                          {agent.shortName}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">Type:</span>
                        <span className="text-sm ml-2 text-muted-foreground">
                          {agent.deployment_type}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm font-medium">ID:</span>
                        <span className="text-sm ml-2 text-muted-foreground font-mono">
                          {agent.id}
                        </span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadAgentContent;
