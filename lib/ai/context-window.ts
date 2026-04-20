/**
 * Display caps for the context-usage meter (aligned with app chat model ids).
 * Actual provider limits may differ by deployment.
 */
export function getChatModelContextWindow(chatModelId: string): number {
  switch (chatModelId) {
    case 'chat-model':
    case 'chat-model-reasoning':
      return 200_000;
    default:
      return 128_000;
  }
}
