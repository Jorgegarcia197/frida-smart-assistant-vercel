import 'server-only';

import type { ChatMessage } from '@/lib/types';

/**
 * Use the library implementation directly. The package root `index.js` runs a debug
 * block when `!module.parent` (true under Next.js/Turbopack) and synchronously opens
 * `./test/data/05-versions-space.pdf` → ENOENT on import.
 */
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export const PDF_MIME = 'application/pdf';

/** Keep model input bounded; very large PDFs are truncated with a notice. */
export const MAX_PDF_TEXT_CHARS = 120_000;

async function fetchAsBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

/**
 * Fetches a PDF URL and returns extracted text bounded by `MAX_PDF_TEXT_CHARS`.
 * Throws on network/parse failures so callers can surface a friendly error.
 */
export async function extractPdfTextFromUrl(url: string): Promise<string> {
  const buffer = await fetchAsBuffer(url);
  const { text } = await pdfParse(buffer);
  const trimmed = (text ?? '').trim();
  const body =
    trimmed.length > 0
      ? trimmed
      : '(No extractable text was found in this PDF. It may be scanned images only.)';

  if (body.length > MAX_PDF_TEXT_CHARS) {
    return `${body.slice(0, MAX_PDF_TEXT_CHARS)}\n\n[…truncated after ${MAX_PDF_TEXT_CHARS} characters]`;
  }
  return body;
}

/**
 * OpenAI-compatible gateways often reject `file` parts with `application/pdf`.
 * Expand PDFs to plain text parts so `convertToModelMessages` + the LLM work.
 * Original `uiMessages` (with file parts) stay unchanged for persistence/UI.
 *
 * Prefer {@link expandFilePartsForModel} which also handles OOXML office files.
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
          if (part.mediaType !== PDF_MIME) {
            return part;
          }

          const label = part.filename ?? 'document.pdf';
          try {
            const body = await extractPdfTextFromUrl(part.url);
            return {
              type: 'text' as const,
              text: `The user uploaded a PDF (“${label}”). Extracted text:\n\n${body}`,
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
