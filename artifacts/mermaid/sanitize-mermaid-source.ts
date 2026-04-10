/**
 * Normalize model output so mermaid.parse/render receive valid diagram text.
 * Strips markdown fences (``` / ```mermaid), optional language lines, HTML <br>,
 * and trailing fences — models often ignore "no code blocks" in prompts.
 */
export function sanitizeMermaidSource(raw: string): string {
  let s = raw.replace(/<br\s*\/?>/gi, '\n').trim();
  if (!s) return s;

  if (s.startsWith('```')) {
    s = s.slice(3).trimStart();
    s = s.replace(/^(?:mermaid|mer|mmd)\s*\r?\n?/i, '').trimStart();
  }

  s = s.replace(/\r?\n```\s*$/s, '').trim();
  s = s.replace(/```\s*$/s, '').trim();

  return s;
}
