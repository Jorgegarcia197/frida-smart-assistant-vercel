import 'server-only';

import type { ChatMessage } from '@/lib/types';

/**
 * Use the library implementation directly. The package root `index.js` runs a debug
 * block when `!module.parent` (true under Next.js/Turbopack) and synchronously opens
 * `./test/data/05-versions-space.pdf` → ENOENT on import.
 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

/** Keep model input bounded; very large PDFs are truncated with a notice. */
const MAX_PDF_TEXT_CHARS = 120_000;

async function fetchPdfAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * OpenAI-compatible gateways often reject `file` parts with `application/pdf`.
 * Expand PDFs to plain text parts so `convertToModelMessages` + the LLM work.
 * Original `uiMessages` (with file parts) stay unchanged for persistence/UI.
 */
export async function expandPdfFilePartsForModel(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (msg) => {
      const parts = await Promise.all(
        msg.parts.map(async (part) => {
          if (part.type !== 'file') {
            return part;
          }
          if (part.mediaType !== 'application/pdf') {
            return part;
          }

          const label = part.filename ?? 'document.pdf';
          try {
            const buffer = await fetchPdfAsBuffer(part.url);
            const { text } = await pdfParse(buffer);
            const trimmed = (text ?? '').trim();
            let body =
              trimmed.length > 0
                ? trimmed
                : '(No extractable text was found in this PDF. It may be scanned images only.)';

            if (body.length > MAX_PDF_TEXT_CHARS) {
              body = `${body.slice(0, MAX_PDF_TEXT_CHARS)}\n\n[…truncated after ${MAX_PDF_TEXT_CHARS} characters]`;
            }

            const combined = `The user uploaded a PDF (“${label}”). Extracted text:\n\n${body}`;

            return {
              type: 'text' as const,
              text: combined,
            };
          } catch (e) {
            const err = e instanceof Error ? e.message : String(e);
            console.warn('[expandPdfFilePartsForModel] PDF handling failed:', err);
            return {
              type: 'text' as const,
              text: `The user uploaded a PDF (“${label}”), but the text could not be extracted (${err}). Ask them to paste key excerpts or try another format.`,
            };
          }
        }),
      );

      return { ...msg, parts };
    }),
  );
}
