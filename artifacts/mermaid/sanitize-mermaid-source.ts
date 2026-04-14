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

  s = mergeSequenceDiagramSplitMessageLines(s);

  return s;
}

/** True if the first `:` in the line is the sequence message separator (arrow before it). */
function hasSequenceArrowBeforeMessageColon(line: string): boolean {
  const idx = line.indexOf(':');
  if (idx <= 0) return false;
  const before = line.slice(0, idx);
  return /(?:->>|-->>|->|-->|[+~-]*>>|[xX]-?-?>+)/.test(before);
}

const SEQUENCE_BLOCK_START =
  /^\s*(?:participant|actor|boundary|control|entity|database|collections|queue|alt|else|end|opt|loop|par|and|break|critical|rect|box|rgba|color|autonumber|activate|deactivate|destroy|links|sequenceDiagram|newpage)\b/i;

const SEQUENCE_NOTE_START = /^\s*note\s+(?:right|left|over)\b/i;

/**
 * Models often break message labels across lines, e.g.
 *   Client->>Auth: POST /login
 *   (user, pass)
 * The second line is invalid on its own — merge into the previous arrow line.
 */
function mergeSequenceDiagramSplitMessageLines(text: string): string {
  if (!/\bsequenceDiagram\b/i.test(text)) return text;

  const lines = text.split(/\r?\n/);
  const out: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      continue;
    }

    let merged = false;
    if (out.length > 0) {
      let lastNonEmptyIdx = -1;
      for (let j = out.length - 1; j >= 0; j--) {
        if (out[j].trim()) {
          lastNonEmptyIdx = j;
          break;
        }
      }

      if (lastNonEmptyIdx >= 0) {
        const prevTrim = out[lastNonEmptyIdx].trim();
        const prevIsArrowMsg =
          hasSequenceArrowBeforeMessageColon(prevTrim) &&
          !SEQUENCE_BLOCK_START.test(prevTrim) &&
          !SEQUENCE_NOTE_START.test(prevTrim);

        const nextLooksLikeNewArrowMsg = hasSequenceArrowBeforeMessageColon(
          trimmed,
        );
        const nextIsStructural =
          SEQUENCE_BLOCK_START.test(trimmed) ||
          SEQUENCE_NOTE_START.test(trimmed);

        if (
          prevIsArrowMsg &&
          !nextIsStructural &&
          !nextLooksLikeNewArrowMsg
        ) {
          while (out.length > lastNonEmptyIdx + 1 && !out[out.length - 1]?.trim()) {
            out.pop();
          }
          out[lastNonEmptyIdx] = `${out[lastNonEmptyIdx]} ${trimmed}`;
          merged = true;
        }
      }
    }

    if (!merged) {
      out.push(line);
    }
  }

  return out.join('\n');
}
