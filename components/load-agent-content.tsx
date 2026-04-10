'use client';

import { useSession } from 'next-auth/react';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Card, CardContent } from './ui/card';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { X, Bot, Loader2, RefreshCw } from 'lucide-react';
import { useAgentForChat } from './agent-provider';
import { useAgentsByDeployment } from '@/hooks/use-agents';

type LoadAgentContentProps = {
  chatId: string;
  setIsLoadAgentOpen: (isOpen: boolean) => void;
};

const LoadAgentContent = ({
  chatId,
  setIsLoadAgentOpen,
}: LoadAgentContentProps) => {
  const { status } = useSession();
  const { setCurrentAgent, setIsLoadingAgent, isLoadingAgent, currentAgent } =
    useAgentForChat(chatId);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');

  const { agents, isLoading, error, mutate } = useAgentsByDeployment(
    'frida-assistant',
    status === 'authenticated',
  );

  useEffect(() => {
    if (error) {
      console.error('Error fetching agents:', error);
      toast.error('Failed to load agents');
    }
  }, [error]);

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
        console.log(
          '[Load Agent] Full agent payload (from list / API mapping):',
          JSON.stringify(selectedAgent, null, 2),
        );
        console.log(
          '[Load Agent] MCP config (mcps):',
          JSON.stringify(selectedAgent.mcps ?? null, null, 2),
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
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center justify-between p-4 border-b">
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

      <div className="flex min-h-0 flex-1 flex-col p-4">
        {isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center space-y-4">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Loading your agents...
            </p>
          </div>
        ) : agents.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center space-y-6">
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
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <div className="shrink-0 space-y-2">
              <h3 className="text-sm font-medium">
                Select an agent to load into your current session
              </h3>
              <p className="text-xs text-muted-foreground">
                Choose from your available agents to enhance your chat
                experience
              </p>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <Label className="shrink-0 text-sm">
                Available Agents ({agents.length})
              </Label>
              <div
                className="min-h-0 flex-1 overflow-y-auto rounded-md border bg-muted/30 p-1"
                data-testid="load-agent-list"
              >
                <div className="flex flex-col gap-2 p-1">
                  {agents.map((agent) => (
                    <Card
                      key={agent.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${
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
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-sm">
                              {agent.name}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
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
            </div>

            <Button
              className="w-full shrink-0"
              onClick={(e) => {
                e.preventDefault();
                handleLoadAgent();
              }}
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

            {selectedAgentId ? (
              <div className="max-h-[min(28vh,220px)] shrink-0 overflow-y-auto rounded-lg border bg-muted/30 p-4">
                <h4 className="mb-2 font-medium text-sm">Agent Details</h4>
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
                        <span className="text-sm ml-2 font-mono text-muted-foreground">
                          {agent.id}
                        </span>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadAgentContent;
