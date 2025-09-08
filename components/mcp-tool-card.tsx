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
import { Server } from 'lucide-react';

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
      <CardHeader className="pb-3">
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

      {displayContent && (
        <CardContent className="pt-0">
          <div
            className={cn(
              'text-sm rounded-md p-3 max-h-48 overflow-y-auto',
              'bg-muted/50 border border-border/50',
              isLoading && 'text-muted-foreground',
            )}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.3s]" />
                <div className="h-2 w-2 bg-current rounded-full animate-bounce [animation-delay:-0.15s]" />
                <div className="h-2 w-2 bg-current rounded-full animate-bounce" />
                <span className="ml-2">Processing...</span>
              </div>
            ) : (
              <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                {displayContent}
              </pre>
            )}
          </div>
        </CardContent>
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
