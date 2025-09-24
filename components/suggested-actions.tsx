'use client';

import { motion } from 'framer-motion';
import { Button } from './ui/button';
import { memo, useMemo } from 'react';
import type { UseChatHelpers } from '@ai-sdk/react';
import type { VisibilityType } from './visibility-selector';
import type { ChatMessage } from '@/lib/types';
import { useAgent } from './agent-provider';
import { transformConversationStarters } from '@/lib/transform-conversation-starters';

interface SuggestedActionsProps {
  chatId: string;
  sendMessage: UseChatHelpers<ChatMessage>['sendMessage'];
  selectedVisibilityType: VisibilityType;
}

function PureSuggestedActions({
  chatId,
  sendMessage,
  selectedVisibilityType,
}: SuggestedActionsProps) {
  const { currentAgent, setHasConversationStarted } = useAgent();

  // Default suggested actions as fallback
  const defaultSuggestedActions = [
    {
      title: 'Create a diagram',
      label: 'of an authentication flow in UML notation',
      action: 'Create a diagram of an authentication flow in UML notation',
    },
    {
      title: 'Rotate a matrix 90 degrees in place',
      label: `in Python`,
      action: `Rotate a matrix 90 degrees in place in Python`,
    },
  ];

  // Use the utility function to transform conversation starters

  // Use agent conversation starters if available, otherwise use defaults
  const suggestedActions =
    currentAgent?.conversationStarters &&
    currentAgent.conversationStarters.length > 0
      ? transformConversationStarters(currentAgent.conversationStarters)
      : defaultSuggestedActions;

  // Calculate the maximum height needed for consistent button sizing
  const maxHeight = useMemo(() => {
    if (suggestedActions.length === 0) return 'auto';

    // Estimate height based on text length and line breaks
    const heights = suggestedActions.map((action) => {
      const titleLines = action.title.split('\n').length;
      const labelLines = action.label ? action.label.split('\n').length : 0;
      const totalLines = titleLines + labelLines;

      // Base height calculation: padding + line height * number of lines
      // p-3 = 12px top + 12px bottom = 24px
      // gap-1 = 4px between title and label
      // leading-snug ≈ 1.375 line height
      const basePadding = 24; // p-3
      const gap = labelLines > 0 ? 4 : 0; // gap-1
      const lineHeight = 16 * 1.375; // text-sm * leading-snug
      const estimatedHeight = basePadding + gap + totalLines * lineHeight;

      return Math.max(estimatedHeight, 60); // minimum height
    });

    const maxCalculatedHeight = Math.max(...heights);
    return `${Math.ceil(maxCalculatedHeight)}px`;
  }, [suggestedActions]);

  return (
    <div
      data-testid="suggested-actions"
      className="grid sm:grid-cols-2 gap-3 w-full"
    >
      {suggestedActions.map((suggestedAction, index) => {
        // Additional safety check
        if (!suggestedAction || !suggestedAction.title) {
          return null;
        }

        return (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ delay: 0.05 * index }}
            key={`suggested-action-${suggestedAction.title}-${index}`}
            className={index > 1 ? 'hidden sm:block' : 'block'}
          >
            <Button
              variant="ghost"
              onClick={async () => {
                window.history.replaceState({}, '', `/chat/${chatId}`);

                // Mark conversation as started
                setHasConversationStarted(true);

                sendMessage({
                  role: 'user',
                  parts: [{ type: 'text', text: suggestedAction.action }],
                });
              }}
              className="text-left border rounded-xl p-3 text-sm flex-1 gap-1 sm:flex-col w-full justify-start items-start max-w-full"
              style={{ height: maxHeight }}
            >
              <span className="font-medium leading-snug break-words overflow-hidden whitespace-pre-line">
                {suggestedAction.title}
              </span>
              {suggestedAction.label && (
                <span className="text-muted-foreground text-xs leading-snug break-words overflow-hidden whitespace-pre-line">
                  {suggestedAction.label}
                </span>
              )}
            </Button>
          </motion.div>
        );
      })}
    </div>
  );
}

export const SuggestedActions = memo(
  PureSuggestedActions,
  (prevProps, nextProps) => {
    if (prevProps.chatId !== nextProps.chatId) return false;
    if (prevProps.selectedVisibilityType !== nextProps.selectedVisibilityType)
      return false;

    return true;
  },
);
