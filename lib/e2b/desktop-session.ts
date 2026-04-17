import 'server-only';

import { Sandbox } from '@e2b/desktop';

/** Metadata key on E2B sandboxes to tie a desktop VM to a chat conversation. */
export const FRIDA_CHAT_SESSION_METADATA_KEY = 'fridaChatSessionId';

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_RESOLUTION: [number, number] = [1280, 720];

export type DesktopSessionOptions = {
  timeoutMs?: number;
  resolution?: [number, number];
  dpi?: number;
};

function requireApiKey(): string {
  const key = process.env.E2B_API_KEY;
  if (!key) {
    throw new Error('E2B_API_KEY is not configured');
  }
  return key;
}

/**
 * Reuse an existing running/paused desktop sandbox for this chat, or create one.
 * Sandboxes are keyed by `chatId` in metadata (server-trusted).
 */
export async function getOrCreateDesktopSandbox(
  chatId: string,
  opts?: DesktopSessionOptions,
): Promise<Sandbox> {
  const apiKey = requireApiKey();
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const resolution = opts?.resolution ?? DEFAULT_RESOLUTION;
  const dpi = opts?.dpi ?? 96;

  const paginator = Sandbox.list({
    apiKey,
    query: {
      metadata: { [FRIDA_CHAT_SESSION_METADATA_KEY]: chatId },
      state: ['running', 'paused'],
    },
    limit: 20,
  });

  let existingId: string | undefined;
  while (paginator.hasNext) {
    const page = await paginator.nextItems();
    const first = page[0];
    if (first?.sandboxId) {
      existingId = first.sandboxId;
      break;
    }
  }

  if (existingId) {
    const sandbox = await Sandbox.connect(existingId, {
      apiKey,
      timeoutMs,
    });
    return sandbox;
  }

  return Sandbox.create({
    apiKey,
    metadata: { [FRIDA_CHAT_SESSION_METADATA_KEY]: chatId },
    timeoutMs,
    resolution,
    dpi,
  });
}

export { DEFAULT_RESOLUTION as DEFAULT_DESKTOP_RESOLUTION, DEFAULT_TIMEOUT_MS };
