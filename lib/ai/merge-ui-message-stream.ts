import type { ChatMessage } from '@/lib/types';
import type { InferUIMessageChunk, UIMessageStreamWriter } from 'ai';

/**
 * Forwards every chunk from `stream` to `writer`. Unlike `writer.merge`, this
 * **rethrows** read errors so callers can retry (e.g. context overflow).
 */
export async function drainUiMessageStreamToWriter(
  writer: UIMessageStreamWriter<ChatMessage>,
  stream: ReadableStream<InferUIMessageChunk<ChatMessage>>,
): Promise<void> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      writer.write(value);
    }
  } finally {
    reader.releaseLock();
  }
}
