import 'server-only';

import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

/**
 * OOXML MIME types handled by this module. OpenAI-compatible gateways do not
 * accept these as `file` parts, so server-side we extract visible text and
 * replace the binary blob with a bounded plain-text description.
 *
 * Matches the office formats covered by Anthropic skills (`pptx`, `docx`, `xlsx`).
 */
export const PPTX_MIME =
  'application/vnd.openxmlformats-officedocument.presentationml.presentation';
export const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export const OFFICE_MIME_TYPES: ReadonlySet<string> = new Set([
  PPTX_MIME,
  DOCX_MIME,
  XLSX_MIME,
]);

export type OfficeMimeType = typeof PPTX_MIME | typeof DOCX_MIME | typeof XLSX_MIME;

/**
 * Same order of magnitude as the PDF path (`MAX_PDF_TEXT_CHARS`) so all file
 * formats behave consistently when the extraction is large.
 */
export const MAX_OFFICE_TEXT_CHARS = 120_000;

/** Upper bound on rows per sheet when stringifying XLSX. Guards runaway sheets. */
const MAX_XLSX_ROWS_PER_SHEET = 2_000;

export function isOfficeMimeType(mimeType: string): mimeType is OfficeMimeType {
  return OFFICE_MIME_TYPES.has(mimeType);
}

export function officeMimeLabel(mimeType: OfficeMimeType): string {
  switch (mimeType) {
    case PPTX_MIME:
      return 'PowerPoint presentation';
    case DOCX_MIME:
      return 'Word document';
    case XLSX_MIME:
      return 'Excel spreadsheet';
  }
}

/** Truncate text at MAX_OFFICE_TEXT_CHARS, appending a human-readable notice. */
export function clampOfficeText(text: string): string {
  if (text.length <= MAX_OFFICE_TEXT_CHARS) return text;
  return `${text.slice(0, MAX_OFFICE_TEXT_CHARS)}\n\n[…truncated after ${MAX_OFFICE_TEXT_CHARS} characters]`;
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return (value ?? '').trim();
}

async function extractXlsxText(buffer: Buffer): Promise<string> {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sections: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    const trimmed = rows
      .split('\n')
      .slice(0, MAX_XLSX_ROWS_PER_SHEET)
      .join('\n');
    const truncatedNote =
      rows.split('\n').length > MAX_XLSX_ROWS_PER_SHEET
        ? `\n[…sheet truncated to first ${MAX_XLSX_ROWS_PER_SHEET} rows]`
        : '';
    sections.push(`## Sheet: ${name}\n${trimmed}${truncatedNote}`);
  }
  return sections.join('\n\n').trim();
}

/**
 * PPTX = zip of XML. Slide text lives in `<a:t>` drawingML runs inside
 * `ppt/slides/slide*.xml`. We concatenate slides in numeric order and also pull
 * speaker notes when present, since those commonly carry template guidance.
 */
async function extractPptxText(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);

  const slideRegex = /^ppt\/slides\/slide(\d+)\.xml$/;
  const notesRegex = /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/;

  const slideEntries: Array<{ index: number; path: string }> = [];
  const notesEntries = new Map<number, string>();

  for (const path of Object.keys(zip.files)) {
    const slideMatch = slideRegex.exec(path);
    if (slideMatch) {
      slideEntries.push({ index: Number(slideMatch[1]), path });
      continue;
    }
    const notesMatch = notesRegex.exec(path);
    if (notesMatch) {
      notesEntries.set(Number(notesMatch[1]), path);
    }
  }

  slideEntries.sort((a, b) => a.index - b.index);

  const textRunRegex = /<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>/g;
  const decode = (xmlText: string): string =>
    xmlText
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");

  const collectRuns = (xml: string): string[] => {
    const out: string[] = [];
    for (const match of xml.matchAll(textRunRegex)) {
      const raw = decode(match[1]).trim();
      if (raw.length > 0) out.push(raw);
    }
    return out;
  };

  const sections: string[] = [];
  for (const { index, path } of slideEntries) {
    const slideXml = await zip.files[path].async('string');
    const runs = collectRuns(slideXml);
    const slideBody = runs.join('\n');

    const notesPath = notesEntries.get(index);
    let notesBody = '';
    if (notesPath) {
      const notesXml = await zip.files[notesPath].async('string');
      const notesRuns = collectRuns(notesXml);
      if (notesRuns.length > 0) {
        notesBody = `\n\n[Speaker notes]\n${notesRuns.join('\n')}`;
      }
    }

    if (slideBody.length === 0 && notesBody.length === 0) continue;
    sections.push(`## Slide ${index}\n${slideBody}${notesBody}`.trim());
  }

  return sections.join('\n\n').trim();
}

/**
 * Fetches an office file URL and returns extracted plain text bounded by
 * `MAX_OFFICE_TEXT_CHARS`. Throws on network/parse failures so the caller can
 * surface a friendly error part, mirroring `expandPdfFilePartsForModel`.
 */
export async function extractOfficeTextFromUrl(
  url: string,
  mimeType: OfficeMimeType,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());

  let extracted: string;
  switch (mimeType) {
    case DOCX_MIME:
      extracted = await extractDocxText(buffer);
      break;
    case XLSX_MIME:
      extracted = await extractXlsxText(buffer);
      break;
    case PPTX_MIME:
      extracted = await extractPptxText(buffer);
      break;
  }

  const body =
    extracted.length > 0
      ? extracted
      : '(No extractable text was found in this file. It may contain only images or other non-text content.)';

  return clampOfficeText(body);
}
