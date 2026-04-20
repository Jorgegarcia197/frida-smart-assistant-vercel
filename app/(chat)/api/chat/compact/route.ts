import { generateText } from 'ai';
import { z } from 'zod';
import { auth } from '@/app/(auth)/auth';
import { ChatSDKError } from '@/lib/errors';
import { myProvider } from '@/lib/ai/providers';
import {
  deleteMessagesByChatIdWhereCreatedAtBefore,
  getChatById,
  getMessagesByChatId,
  saveMessages,
} from '@/lib/db/queries';
import type { DBMessage } from '@/lib/db/firebase-types';
import { generateUUID } from '@/lib/utils';

export const maxDuration = 120;

const bodySchema = z.object({
  chatId: z.string().min(1),
  keepRecent: z.number().int().min(2).max(50).optional(),
});

function transcriptForCompact(messages: DBMessage[], maxChars = 90_000): string {
  const lines: string[] = [];
  let used = 0;
  for (const m of messages) {
    const parts = m.parts as Array<{ type: string; text?: string }>;
    const text = parts
      .filter((p) => p.type === 'text')
      .map((p) => (typeof p.text === 'string' ? p.text : ''))
      .join('\n');
    const line = `${m.role}: ${text}`;
    if (used + line.length > maxChars) {
      lines.push(`${m.role}: ${text.slice(0, Math.max(0, maxChars - used - 10))}…`);
      break;
    }
    lines.push(line);
    used += line.length + 1;
  }
  return lines.join('\n\n---\n\n');
}

export async function POST(request: Request) {
  if (process.env.ENABLE_MANUAL_THREAD_COMPACT !== 'true') {
    return new ChatSDKError(
      'not_found:api',
      'Manual thread compact is disabled for this deployment.',
    ).toResponse();
  }

  const session = await auth();
  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return new ChatSDKError('bad_request:api', 'Invalid body').toResponse();
  }

  const { chatId, keepRecent: keepRecentRaw } = parsed.data;
  const keepRecent =
    keepRecentRaw ??
    (Number.parseInt(process.env.COMPACT_KEEP_RECENT_MESSAGES ?? '8', 10) ||
      8);

  const chat = await getChatById({ id: chatId });
  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }
  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const messages = await getMessagesByChatId({ id: chatId });
  if (messages.length < keepRecent + 2) {
    return Response.json(
      {
        error: 'not_enough_messages',
        message: 'Need more history than keepRecent to compact safely.',
      },
      { status: 400 },
    );
  }

  const tail = messages.slice(-keepRecent);
  const firstKept = tail[0];
  if (!firstKept) {
    return Response.json({ error: 'empty_tail' }, { status: 400 });
  }
  const cutoff = firstKept.createdAt;
  const head = messages.slice(0, -keepRecent);
  const transcript = transcriptForCompact(head);

  const compactModelId =
    process.env.COMPACT_SUMMARY_MODEL?.trim() || 'title-model';

  const { text: summary } = await generateText({
    model: myProvider.languageModel(compactModelId),
    system: `You compress older chat history into a concise factual summary for the model context.
Rules:
- Use markdown with short sections: Intent, Key facts / data, Files & tools touched, Open questions, Errors.
- Do not invent facts; only use the transcript.
- Max ~1200 words.`,
    prompt: `Transcript (older messages only):\n\n${transcript}`,
  });

  const deleted = await deleteMessagesByChatIdWhereCreatedAtBefore({
    chatId,
    before: cutoff,
  });

  const summaryMessage: DBMessage = {
    id: generateUUID(),
    chatId,
    role: 'assistant',
    parts: [
      {
        type: 'text',
        text: `## Thread compacted (manual)\n\n${summary.trim()}`,
      },
    ],
    attachments: [],
    createdAt: new Date(cutoff.getTime() - 1000),
  };

  await saveMessages({ messages: [summaryMessage] });

  return Response.json({
    ok: true,
    deletedCount: deleted,
    summaryMessageId: summaryMessage.id,
    keptMessages: tail.length,
  });
}
