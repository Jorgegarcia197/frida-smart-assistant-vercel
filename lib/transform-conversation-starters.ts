/**
 * Transforms conversation starters from various schemas to the expected suggested actions format
 */
export function transformConversationStarters(starters: any[]): Array<{
  title: string;
  label: string;
  action: string;
}> {
  if (!starters || !Array.isArray(starters)) return [];

  return starters
    .filter((starter) => starter != null) // Remove null/undefined items
    .map((starter, index) => {
      // Handle different possible schemas
      if (typeof starter === 'string') {
        // If it's just a string, use it as both title and action
        const processedText = addLineBreaks(starter.trim());
        return {
          title: processedText || `Conversation Starter ${index + 1}`,
          label: '',
          action: starter.trim() || `Start conversation ${index + 1}`,
        };
      } else if (starter && typeof starter === 'object') {
        // If it's an object, try to map the fields intelligently
        const title =
          starter.title ||
          starter.text ||
          starter.label ||
          starter.name ||
          starter.question ||
          `Conversation Starter ${index + 1}`;
        const label =
          starter.label ||
          starter.description ||
          starter.subtitle ||
          starter.context ||
          '';
        const action =
          starter.action ||
          starter.text ||
          starter.title ||
          starter.label ||
          starter.name ||
          starter.question ||
          title;

        return {
          title: addLineBreaks(String(title).trim()),
          label: String(label).trim(),
          action: String(action).trim(),
        };
      }

      // Fallback for unexpected formats
      return {
        title: `Conversation Starter ${index + 1}`,
        label: '',
        action:
          addLineBreaks(String(starter).trim()) ||
          `Start conversation ${index + 1}`,
      };
    })
    .filter((action) => action.title && action.action); // Remove empty actions
}

/**
 * Adds line breaks to long text to improve readability
 */
function addLineBreaks(text: string, maxLength = 60): string {
  if (!text || text.length <= maxLength) return text;

  // Split by common break points
  const words = text.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (`${currentLine} ${word}`.length <= maxLength) {
      currentLine += `${currentLine ? ' ' : ''}${word}`;
    } else {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        // If a single word is too long, just add it
        lines.push(word);
      }
    }
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines.join('\n');
}
