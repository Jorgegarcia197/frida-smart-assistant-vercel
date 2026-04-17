import 'server-only';

import type { ChatMessage } from '@/lib/types';

import {
  PDF_MIME,
  extractPdfTextFromUrl,
} from './expand-pdf-parts-for-model';
import {
  OFFICE_MIME_TYPES,
  isOfficeMimeType,
  officeMimeLabel,
  extractOfficeTextFromUrl,
} from './expand-office-parts-for-model';

/**
 * Rewrites user `file` parts that the OpenAI-compatible chat gateway can't
 * consume (PDF + OOXML office files) into bounded plain-text parts so
 * `convertToModelMessages` works. Stored `ChatMessage`s keep the original
 * `file` parts — only the model-bound copy is transformed.
 *
 * OOXML formats (pptx/docx/xlsx) are not modeled as native multimodal document
 * blocks on the provider side; following Claude Code's pattern we extract text
 * server-side and tell the model the rendering is text-only with likely loss
 * of layout, charts, and embedded images.
 */
export async function expandFilePartsForModel(
  messages: ChatMessage[],
): Promise<ChatMessage[]> {
  return Promise.all(
    messages.map(async (msg) => {
      const parts = await Promise.all(
        msg.parts.map(async (part) => {
          if (part.type !== 'file') return part;

          const { mediaType, url, filename } = part;

          if (mediaType === PDF_MIME) {
            const label = filename ?? 'document.pdf';
            try {
              const body = await extractPdfTextFromUrl(url);
              return {
                type: 'text' as const,
                text: `The user uploaded a PDF (“${label}”). Extracted text:\n\n${body}`,
              };
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              console.warn('[expandFilePartsForModel] PDF handling failed:', err);
              return {
                type: 'text' as const,
                text: `The user uploaded a PDF (“${label}”), but the text could not be extracted (${err}). Ask them to paste key excerpts or try another format.`,
              };
            }
          }

          if (isOfficeMimeType(mediaType)) {
            const label = filename ?? defaultOfficeFilename(mediaType);
            const formatName = officeMimeLabel(mediaType);
            try {
              const body = await extractOfficeTextFromUrl(url, mediaType);
              return {
                type: 'text' as const,
                text:
                  `The user uploaded a ${formatName} (“${label}”). Extracted text only — layout, images, and embedded charts may be missing. ` +
                  `Ask follow-up questions if key visual context seems required.\n\n${body}`,
              };
            } catch (e) {
              const err = e instanceof Error ? e.message : String(e);
              console.warn('[expandFilePartsForModel] Office handling failed:', err);
              return {
                type: 'text' as const,
                text: `The user uploaded a ${formatName} (“${label}”), but the text could not be extracted (${err}). Ask them to paste key excerpts or try another format.`,
              };
            }
          }

          return part;
        }),
      );

      return { ...msg, parts };
    }),
  );
}

function defaultOfficeFilename(mediaType: string): string {
  if (!OFFICE_MIME_TYPES.has(mediaType)) return 'document';
  if (mediaType.endsWith('presentationml.presentation'))
    return 'presentation.pptx';
  if (mediaType.endsWith('wordprocessingml.document')) return 'document.docx';
  if (mediaType.endsWith('spreadsheetml.sheet')) return 'spreadsheet.xlsx';
  return 'document';
}
