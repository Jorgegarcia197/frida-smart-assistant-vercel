import { z } from 'zod';
import { streamObject, streamText } from 'ai';
import { myProvider } from '@/lib/ai/providers';
import { codePrompt, updateDocumentPrompt } from '@/lib/ai/prompts';
import { createDocumentHandler } from '@/lib/artifacts/server';

/** Prefer first ```python … ``` or generic ``` … ``` fence; otherwise use trimmed raw text. */
function extractPythonFromModelText(markdown: string): string {
  const pythonFence =
    markdown.match(/```(?:python|py)\s*\r?\n([\s\S]*?)```/i) ??
    markdown.match(/```(?:python|py)\s+([\s\S]*?)```/i);
  if (pythonFence?.[1]) {
    return pythonFence[1].trim();
  }
  const anyFence = markdown.match(/```\s*\r?\n([\s\S]*?)```/);
  if (anyFence?.[1]) {
    return anyFence[1].trim();
  }
  return markdown.trim();
}

/**
 * When structured output fails (e.g. upstream JSON mode errors, LiteLLM `NoneType` len),
 * plain text + fences still works for many OpenAI-compatible gateways.
 */
async function generateCodeViaStreamText(prompt: string, system: string) {
  let accumulated = '';
  const { fullStream } = streamText({
    model: myProvider.languageModel('artifact-model'),
    system: `${system}\n\nRespond with exactly one markdown fenced block \`\`\`python ... \`\`\` containing the full runnable program. Put no other text outside that fence.`,
    prompt,
  });

  for await (const delta of fullStream) {
    if (delta.type === 'text-delta') {
      accumulated += delta.text;
    }
  }

  return extractPythonFromModelText(accumulated);
}

export const codeDocumentHandler = createDocumentHandler<'code'>({
  kind: 'code',
  onCreateDocument: async ({ title, dataStream }) => {
    let draftContent = '';

    const result = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: codePrompt,
      prompt: `Write Python for this task (title / summary):\n\n${title}`,
      schema: z.object({
        code: z.string(),
      }),
    });

    for await (const delta of result.fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { code } = object;

        if (code) {
          dataStream.write({
            type: 'data-codeDelta',
            data: code ?? '',
            transient: true,
          });

          draftContent = code;
        }
      }
    }

    try {
      const final = await result.object;
      if (final?.code && final.code !== draftContent) {
        draftContent = final.code;
        dataStream.write({
          type: 'data-codeDelta',
          data: draftContent,
          transient: true,
        });
      }
    } catch {
      // Keep streamed draftContent; errors are logged by streamObject by default
    }

    if (!draftContent.trim()) {
      console.warn(
        '[code artifact] streamObject produced no code (often JSON/schema issues on the gateway). Trying streamText fallback.',
      );
      try {
        draftContent = await generateCodeViaStreamText(
          `Write Python for this task (title / summary):\n\n${title}`,
          codePrompt,
        );
        if (draftContent) {
          dataStream.write({
            type: 'data-codeDelta',
            data: draftContent,
            transient: true,
          });
        }
      } catch (e) {
        console.error('[code artifact] streamText fallback failed:', e);
      }
    }

    return draftContent;
  },
  onUpdateDocument: async ({ document, description, dataStream }) => {
    let draftContent = '';

    const result = streamObject({
      model: myProvider.languageModel('artifact-model'),
      system: updateDocumentPrompt(document.content, 'code'),
      prompt: description,
      schema: z.object({
        code: z.string(),
      }),
    });

    for await (const delta of result.fullStream) {
      const { type } = delta;

      if (type === 'object') {
        const { object } = delta;
        const { code } = object;

        if (code) {
          dataStream.write({
            type: 'data-codeDelta',
            data: code ?? '',
            transient: true,
          });

          draftContent = code;
        }
      }
    }

    try {
      const final = await result.object;
      if (final?.code && final.code !== draftContent) {
        draftContent = final.code;
        dataStream.write({
          type: 'data-codeDelta',
          data: draftContent,
          transient: true,
        });
      }
    } catch {
      // Keep streamed draftContent
    }

    if (!draftContent.trim()) {
      console.warn(
        '[code artifact] update: streamObject produced no code; trying streamText fallback.',
      );
      try {
        draftContent = await generateCodeViaStreamText(
          description,
          updateDocumentPrompt(document.content, 'code'),
        );
        if (draftContent) {
          dataStream.write({
            type: 'data-codeDelta',
            data: draftContent,
            transient: true,
          });
        }
      } catch (e) {
        console.error('[code artifact] update streamText fallback failed:', e);
      }
    }

    return draftContent;
  },
});
