/**
 * Detects provider / gateway failures where the prompt or context is too large
 * to process. Tune strings against real gateway responses when debugging.
 */
export function isContextOverflowError(error: unknown): boolean {
  if (error == null) return false;
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message, error.name);
    const anyErr = error as Error & {
      cause?: unknown;
      data?: unknown;
      responseBody?: unknown;
    };
    if (anyErr.cause != null) parts.push(String(anyErr.cause));
    if (anyErr.data != null) parts.push(JSON.stringify(anyErr.data));
    if (anyErr.responseBody != null)
      parts.push(
        typeof anyErr.responseBody === 'string'
          ? anyErr.responseBody
          : JSON.stringify(anyErr.responseBody),
      );
  } else {
    parts.push(String(error));
  }
  const haystack = parts.join('\n').toLowerCase();
  return (
    haystack.includes('prompt_too_long') ||
    haystack.includes('context_length_exceeded') ||
    haystack.includes('maximum context') ||
    haystack.includes('input is too long') ||
    haystack.includes('too many tokens') ||
    haystack.includes('token limit') ||
    haystack.includes('413') ||
    haystack.includes('request entity too large') ||
    haystack.includes('context window') ||
    haystack.includes('exceeds the maximum') ||
    (haystack.includes('max_tokens') && haystack.includes('exceed'))
  );
}
