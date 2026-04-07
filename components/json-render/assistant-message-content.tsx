'use client';

import { useJsonRenderMessage } from '@json-render/react';
import type { ChatMessage } from '@/lib/types';
import { MessageContent } from '@/components/elements/message';
import { Response } from '@/components/elements/response';
import { sanitizeText } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { GenerativeUIRenderer } from '@/components/json-render/generative-ui-renderer';

export function AssistantMessageContent({
  message,
  isLoading,
}: {
  message: ChatMessage;
  isLoading: boolean;
}) {
  const { spec, text, hasSpec } = useJsonRenderMessage(message.parts);

  return (
    <>
      {text ? (
        <MessageContent
          data-testid="message-content"
          className={cn(
            'justify-start items-start text-left',
            'bg-transparent -ml-4',
          )}
        >
          <Response>{sanitizeText(text)}</Response>
        </MessageContent>
      ) : null}
      {hasSpec && spec ? (
        <div className="w-full mt-2">
          <GenerativeUIRenderer spec={spec} loading={isLoading} />
        </div>
      ) : null}
    </>
  );
}
