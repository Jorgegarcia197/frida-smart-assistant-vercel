'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDownIcon, Server } from 'lucide-react';

interface McpToolCardProps {
  serverName: string;
  toolName: string;
  description?: string;
  result?: any;
  state: 'call' | 'result';
  args?: any;
  isReadonly?: boolean;
}

function PureMcpToolCard({
  serverName,
  toolName,
  description,
  result,
  state,
  args,
  isReadonly = false,
}: McpToolCardProps) {
  const formatContent = (data: any) => {
    if (!data) return null;

    if (typeof data === 'string') {
      return data;
    }

    if (typeof data === 'object') {
      // Try to find text content in common MCP result structures
      if (data.content && Array.isArray(data.content)) {
        return data.content
          .map((item: any) => item.text || item.content || JSON.stringify(item))
          .join('\n');
      }

      if (data.text) {
        return data.text;
      }

      if (data.message) {
        return data.message;
      }

      // Fallback to JSON for complex objects, but make it readable
      return JSON.stringify(data, null, 2);
    }

    return String(data);
  };

  const displayContent =
    state === 'result' ? formatContent(result) : formatContent(args);
  const isLoading = state === 'call';

  // Check if result contains an error
  const hasError =
    state === 'result' &&
    result &&
    typeof result === 'object' &&
    (result.error ||
      result.isError ||
      (result.content &&
        Array.isArray(result.content) &&
        result.content.some(
          (c: any) =>
            c.type === 'text' &&
            c.text &&
            c.text.toLowerCase().includes('error'),
        )));

  return (
    <Card
      className={cn(
        'w-full transition-all duration-200 border',
        hasError && 'border-destructive/50 bg-destructive/5',
      )}
    >
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div
              className={cn(
                'h-4 w-4',
                hasError ? 'text-destructive' : 'text-muted-foreground',
              )}
            >
              <Server size={16} />
            </div>
            <CardTitle className="text-sm font-medium">
              {isLoading
                ? `Calling MCP tool: ${toolName}...`
                : hasError
                  ? `${toolName} Error`
                  : `MCP tool "${toolName}" was executed`}
            </CardTitle>
          </div>
          <Badge
            variant={hasError ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            {serverName}
          </Badge>
        </div>
        {description && (
          <CardDescription className="text-xs">{description}</CardDescription>
        )}
      </CardHeader>

      {displayContent && isLoading && (
        <CardContent className="pt-0">
          <div
            className={cn(
              'text-sm rounded-md p-4 max-h-48 overflow-y-auto',
              'bg-muted/50 border border-border/50',
              'text-muted-foreground',
            )}
          >
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="h-2 w-2 bg-current rounded-full animate-bounce" />
              <span className="ml-2">Processing...</span>
            </div>
          </div>
        </CardContent>
      )}

      {displayContent && !isLoading && (
        <Collapsible defaultOpen={false} className="group space-y-0">
          <div
            className={cn(
              'px-6 pb-0.5',
              'group-data-[state=closed]:px-7 group-data-[state=closed]:pb-3',
            )}
          >
            <CollapsibleTrigger
              className={cn(
                'group/trigger flex w-full items-center justify-between gap-2 rounded-md border border-border/50',
                'bg-muted/30 px-4 py-2.5 text-left text-xs font-medium text-muted-foreground',
                'group-data-[state=closed]:px-5 group-data-[state=closed]:py-3.5',
                'hover:bg-muted/50 hover:text-foreground',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              )}
            >
              <span>Tool output</span>
              <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]/trigger:rotate-180" />
            </CollapsibleTrigger>
          </div>
          <CollapsibleContent
            className={cn(
              'data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2',
              'outline-none data-[state=closed]:animate-out data-[state=open]:animate-in',
            )}
          >
            <CardContent className="pt-3">
              <div
                className={cn(
                  'text-sm rounded-md p-4 max-h-48 overflow-y-auto',
                  'bg-muted/50 border border-border/50',
                )}
              >
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                  {displayContent}
                </pre>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      )}
    </Card>
  );
}

export const McpToolCard = memo(PureMcpToolCard, (prevProps, nextProps) => {
  return (
    prevProps.toolName === nextProps.toolName &&
    prevProps.state === nextProps.state &&
    prevProps.result === nextProps.result &&
    prevProps.args === nextProps.args
  );
});
