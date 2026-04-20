/**
 * Reduces Anthropic-compatible web_search / web_fetch tool payloads to a small
 * structured shape for the model and UI (no huge encrypted blobs or reprs).
 */

export const MAX_WEB_TOOL_RESULT_CHARS = 100_000;

/** Max structured hits we keep (URLs + titles). */
const MAX_SOURCES = 24;

const REDACTED_ENCRYPTED = '[redacted: encrypted provider payload]';
const REDACTED_LONG_RUN = '[redacted: long opaque run]';

export type FridaWebSource = { url: string; title?: string };

/** One row from provider web search (for compact Details UI). */
export type FridaWebSearchHit = {
  url: string;
  title?: string;
  page_age?: string;
};

export type FridaNormalizedWebToolResult = {
  _fridaWebNormalized: true;
  /** Full markdown for the model / persistence (includes fenced **Details**). */
  summary: string;
  sources: FridaWebSource[];
  /**
   * First line only (`**Search:** …` / `**Fetch:** …`) for compact UI — no Details blob.
   * Omitted on older persisted tool results (fall back to `summary` in `Response`).
   */
  headlineMarkdown?: string;
  /**
   * Redacted provider repr for legacy UI `pre` (URLs stripped; use `sources` for links).
   * Prefer `detailHits` + `Sources` UI when present.
   */
  detailsPlain?: string;
  /**
   * Structured search rows (page age, title, URL) for `Sources` / `WebSourceUrlRows` in tool UI.
   */
  detailHits?: FridaWebSearchHit[];
};

export function isFridaNormalizedWebToolResult(
  value: unknown,
): value is FridaNormalizedWebToolResult {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o._fridaWebNormalized === true &&
    typeof o.summary === 'string' &&
    Array.isArray(o.sources)
  );
}

function truncateSummary(text: string): string {
  if (text.length <= MAX_WEB_TOOL_RESULT_CHARS) return text;
  return `${text.slice(0, MAX_WEB_TOOL_RESULT_CHARS)}\n\n[truncated]`;
}

function longestBacktickRun(s: string): number {
  let max = 0;
  let cur = 0;
  for (const ch of s) {
    if (ch === '`') {
      cur++;
      max = Math.max(max, cur);
    } else {
      cur = 0;
    }
  }
  return max;
}

/**
 * Wrap so markdown renders as `<pre>`, not `<p>` (avoids Streamdown link tooltips
 * that inject `<div>` inside `<p>` and break hydration).
 */
function wrapDetailsAsFencedCode(excerpt: string): string {
  const trimmed = excerpt.trimEnd();
  if (!trimmed) return '';
  const innerFence = longestBacktickRun(trimmed) + 1;
  const fence = '`'.repeat(Math.max(3, innerFence));
  return `${fence}\n${trimmed}\n${fence}`;
}

/** Remove raw URLs from Details for plain `<pre>` UI (links live in `sources`). */
function stripHttpUrlsForPlainDisplay(text: string): string {
  return text.replace(/\bhttps?:\/\/[^\s\]'"<>]+/gi, '⟨link⟩');
}

/** Redact Python-style `encrypted_content='…'` / double-quoted segments. */
export function redactEncryptedContentSegments(text: string): string {
  let s = text.replace(
    /encrypted_content\s*=\s*'(?:[^'\\]|\\.)*'/g,
    `encrypted_content='${REDACTED_ENCRYPTED}'`,
  );
  s = s.replace(
    /encrypted_content\s*=\s*"(?:[^"\\]|\\.)*"/g,
    `encrypted_content="${REDACTED_ENCRYPTED}"`,
  );
  return s;
}

/** Collapse very long base64-like runs (provider blobs). */
export function redactLongOpaqueRuns(text: string): string {
  return text.replace(/[A-Za-z0-9+/=]{200,}/g, REDACTED_LONG_RUN);
}

export function redactWebToolTextForDisplay(text: string): string {
  return redactLongOpaqueRuns(redactEncryptedContentSegments(text));
}

/**
 * Best-effort redaction for "Tool input (debug)" when args include merged `_result`.
 */
export function redactWebToolDebugPayloadString(serialized: string): string {
  return redactWebToolTextForDisplay(serialized);
}

function readWebArgs(args: unknown): { query?: string; url?: string } {
  if (!args || typeof args !== 'object') return {};
  const o = args as Record<string, unknown>;
  return {
    query: typeof o.query === 'string' ? o.query : undefined,
    url: typeof o.url === 'string' ? o.url : undefined,
  };
}

function isHttpUrl(s: string): boolean {
  return /^https?:\/\//i.test(s.trim());
}

function dedupePushSource(
  out: FridaWebSource[],
  seen: Set<string>,
  url: string,
  title?: string,
): void {
  const u = url.trim();
  if (!isHttpUrl(u) || seen.has(u)) return;
  seen.add(u);
  if (out.length >= MAX_SOURCES) return;
  out.push(title?.trim() ? { url: u, title: title.trim() } : { url: u });
}

function hitDedupeKey(h: FridaWebSearchHit, seq: number): string {
  const u = h.url.trim();
  if (isHttpUrl(u)) return u;
  return `${u}::${h.title ?? ''}::${h.page_age ?? ''}::${seq}`;
}

function readPageAge(value: unknown): string | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return value.trim() || undefined;
  return String(value);
}

/**
 * Recursively collect `web_search_result` rows (page_age, title, url only —
 * no encrypted blobs).
 */
function collectWebSearchHits(
  value: unknown,
  out: FridaWebSearchHit[],
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 14 || value == null) return;

  if (typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectWebSearchHits(item, out, seen, depth + 1);
    }
    return;
  }

  const o = value as Record<string, unknown>;
  const t = o.type;
  if (
    t === 'web_search_result' &&
    typeof o.url === 'string' &&
    o.url.trim().length > 0
  ) {
    const url = o.url.trim();
    const title =
      typeof o.title === 'string' ? o.title.trim() || undefined : undefined;
    const page_age = readPageAge(o.page_age);
    const key = hitDedupeKey({ url, title, page_age }, out.length);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ url, title, page_age });
    }
  }

  for (const v of Object.values(o)) {
    collectWebSearchHits(v, out, seen, depth + 1);
  }
}

/**
 * Fallback when the provider dumps Python repr (`BetaWebSearchResultBlock(...)`) into text.
 */
function parseWebSearchHitsFromProviderReprString(
  text: string,
): FridaWebSearchHit[] {
  if (!/BetaWebSearchResultBlock|web_search_result/i.test(text)) return [];

  const hits: FridaWebSearchHit[] = [];
  const urlRe = /url='([^']*)'/g;
  for (;;) {
    const m = urlRe.exec(text);
    if (m === null) break;

    const url = m[1]?.trim() ?? '';
    if (!url) continue;

    const ctxStart = Math.max(0, m.index - 12_000);
    const ctx = text.slice(ctxStart, m.index + m[0].length + 8);
    if (
      !/BetaWebSearchResultBlock/i.test(ctx) &&
      !/type\s*=\s*['"]web_search_result['"]/i.test(ctx)
    ) {
      continue;
    }

    const title =
      /title='((?:[^'\\]|\\.)*)'/.exec(ctx)?.[1]?.replace(/\\'/g, "'") ??
      /title="((?:[^"\\]|\\.)*)"/.exec(ctx)?.[1];
    let page_age: string | undefined;
    if (/page_age\s*=\s*None\b/.test(ctx)) {
      page_age = undefined;
    } else {
      page_age = readPageAge(/page_age='([^']*)'/.exec(ctx)?.[1]);
    }

    hits.push({ url, title, page_age });
  }

  return hits;
}

/** Plain text for Details UI and fenced block in model summary. */
export function formatWebSearchHitsPlain(hits: FridaWebSearchHit[]): string {
  return hits
    .map((h) => {
      const age = h.page_age?.trim() ? h.page_age : '—';
      const title = h.title?.trim() ? h.title : '—';
      return `Page age: ${age}\nTitle: ${title}\nURL: ${h.url}`;
    })
    .join('\n\n');
}

function extractWebSearchHits(raw: unknown, textualBlob: string): FridaWebSearchHit[] {
  const out: FridaWebSearchHit[] = [];
  const seen = new Set<string>();
  collectWebSearchHits(raw, out, seen, 0);

  if (out.length === 0) {
    const fromRepr = parseWebSearchHitsFromProviderReprString(textualBlob);
    for (const h of fromRepr) {
      const key = hitDedupeKey(h, out.length);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(h);
      }
    }
  }

  return out;
}

function collectStructuredSources(
  value: unknown,
  out: FridaWebSource[],
  seen: Set<string>,
  depth: number,
): void {
  if (depth > 14 || value == null) return;
  if (typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStructuredSources(item, out, seen, depth + 1);
    }
    return;
  }

  const o = value as Record<string, unknown>;
  const url = o.url;
  if (typeof url === 'string' && isHttpUrl(url)) {
    const title =
      typeof o.title === 'string'
        ? o.title
        : typeof o.name === 'string'
          ? o.name
          : undefined;
    dedupePushSource(out, seen, url, title);
  }

  for (const v of Object.values(o)) {
    collectStructuredSources(v, out, seen, depth + 1);
  }
}

function extractMarkdownLinksFromText(
  text: string,
  out: FridaWebSource[],
  seen: Set<string>,
): void {
  for (const m of text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/gi)) {
    const href = m[2];
    const label = m[1];
    if (typeof href === 'string') {
      dedupePushSource(
        out,
        seen,
        href,
        typeof label === 'string' ? label.trim() || undefined : undefined,
      );
    }
    if (out.length >= MAX_SOURCES) break;
  }
}

function looksLikeToolError(o: Record<string, unknown>): string | null {
  if (typeof o.error === 'string' && o.error.trim()) {
    return redactWebToolTextForDisplay(o.error.trim()).slice(0, 2000);
  }
  if (typeof o.error_code === 'string' && o.error_code.trim()) {
    const msg =
      typeof o.message === 'string'
        ? o.message
        : typeof o.error_message === 'string'
          ? o.error_message
          : '';
    const combined = `${o.error_code}${msg ? `: ${msg}` : ''}`;
    return redactWebToolTextForDisplay(combined).slice(0, 2000);
  }
  if (o.isError === true && typeof o.message === 'string') {
    return redactWebToolTextForDisplay(o.message.trim()).slice(0, 2000);
  }
  return null;
}

function stringifyLeaf(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return JSON.stringify(value, null, 0);
  } catch {
    return String(value);
  }
}

function extractTextualBlob(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw;
  if (typeof raw !== 'object') return stringifyLeaf(raw);

  const o = raw as Record<string, unknown>;

  const err = looksLikeToolError(o);
  if (err) return `**Error:** ${err}`;

  if (typeof o.output === 'string') return o.output;
  if (typeof o.text === 'string') return o.text;
  if (typeof o.message === 'string') return o.message;

  if (Array.isArray(o.content)) {
    const texts = o.content
      .map((c: unknown) => {
        if (!c || typeof c !== 'object') return '';
        const p = c as { type?: string; text?: string };
        if (p.type === 'text' && typeof p.text === 'string') return p.text;
        return '';
      })
      .filter(Boolean);
    if (texts.length) return texts.join('\n');
  }

  try {
    return JSON.stringify(o, null, 2);
  } catch {
    return String(o);
  }
}

function buildHeaderLine(toolName: string, args: unknown): string | undefined {
  const { query, url } = readWebArgs(args);
  if (toolName === 'web_fetch') {
    if (url?.trim()) return `**Fetch:** ${url.trim()}`;
  }
  if (toolName === 'web_search' || toolName === '$BUILT_IN_WEB_SEARCH') {
    if (query?.trim()) return `**Search:** ${query.trim()}`;
  }
  if (url?.trim()) return `**URL:** ${url.trim()}`;
  if (query?.trim()) return `**Query:** ${query.trim()}`;
  return undefined;
}

/**
 * Normalize provider web tool output to `{ _fridaWebNormalized, summary, sources }`.
 */
export function normalizeAnthropicWebToolResult(
  toolName: string,
  raw: unknown,
  args: unknown,
): FridaNormalizedWebToolResult {
  const seen = new Set<string>();
  const sources: FridaWebSource[] = [];

  collectStructuredSources(raw, sources, seen, 0);

  const blob = extractTextualBlob(raw);
  const redactedBlob = redactWebToolTextForDisplay(blob);
  extractMarkdownLinksFromText(redactedBlob, sources, seen);

  const webHits = extractWebSearchHits(raw, blob);

  const header = buildHeaderLine(toolName, args);
  const headlineMarkdown = header ?? `**${toolName}**`;
  const lines: string[] = [];

  lines.push(headlineMarkdown);

  if (sources.length > 0) {
    lines.push('');
    lines.push('**Sources:**');
    for (const s of sources) {
      const label = s.title?.trim() || s.url;
      lines.push(`- [${label}](${s.url})`);
    }
  }

  let detailsPlain: string | undefined;

  if (webHits.length > 0) {
    const compact = formatWebSearchHitsPlain(webHits);
    detailsPlain = compact;
    lines.push('');
    lines.push('**Details:**');
    lines.push(wrapDetailsAsFencedCode(compact));
  } else if (redactedBlob.trim()) {
    const excerpt =
      redactedBlob.length > 12_000
        ? `${redactedBlob.slice(0, 12_000)}\n\n…`
        : redactedBlob;
    detailsPlain = stripHttpUrlsForPlainDisplay(excerpt.trim());
    lines.push('');
    lines.push('**Details:**');
    lines.push(wrapDetailsAsFencedCode(excerpt));
  } else if (sources.length === 0) {
    lines.push('');
    lines.push(
      '*[Could not normalize provider payload; rely on the assistant text above.]*',
    );
  }

  let summary = lines.join('\n').trim();
  if (!summary) {
    summary =
      '*[Could not normalize provider payload; rely on the assistant text above.]*';
  }

  summary = truncateSummary(summary);

  return {
    _fridaWebNormalized: true,
    summary,
    sources: sources.slice(0, MAX_SOURCES),
    headlineMarkdown,
    detailsPlain,
    detailHits:
      webHits.length > 0 ? webHits.slice(0, MAX_SOURCES) : undefined,
  };
}
