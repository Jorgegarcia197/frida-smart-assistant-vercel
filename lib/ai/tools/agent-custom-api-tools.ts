import { dynamicTool } from 'ai';
import { z } from 'zod/v3';

/** Single tool from Frida Agent Builder `tools` map (type `api`). */
export type AgentCustomApiToolEntry = {
  enabled?: boolean;
  description?: string;
  type?: string;
  id?: string;
  name?: string;
  config?: {
    authType?: string;
    queryParams?: Array<{ key: string; value: string }>;
    bodyParams?: Array<{ key: string; value: string }>;
    apiKey?: string;
    url?: string;
    httpMethod?: string;
  };
};

function needsQueryPlaceholder(tool: AgentCustomApiToolEntry): boolean {
  const cfg = tool.config;
  if (!cfg) return false;
  const qp = cfg.queryParams ?? [];
  const bp = cfg.bodyParams ?? [];
  const re = /\{query\}/i;
  return [...qp, ...bp].some((p) => re.test(p.value ?? ''));
}

function substitutePlaceholders(
  value: string,
  args: { query?: string },
): string {
  return value.replace(/\{query\}/gi, args.query ?? '');
}

function buildAuthHeaders(
  authType: string | undefined,
  apiKey: string | undefined,
): Record<string, string> {
  if (!apiKey || !authType) return {};
  const t = authType.toLowerCase();
  if (t === 'bearer') {
    const v = apiKey.startsWith('Bearer ') ? apiKey : `Bearer ${apiKey}`;
    return { Authorization: v };
  }
  return {};
}

/**
 * Builds AI SDK `dynamicTool` instances for agent `tools` entries of type `api`
 * (HTTP calls defined in Agent Builder). Executes on the server only.
 */
export function buildAgentCustomApiTools(
  raw: unknown,
  sanitizeModelToolName: (raw: string, used: Set<string>) => string,
  usedModelToolNames: Set<string>,
): {
  tools: Record<string, ReturnType<typeof dynamicTool>>;
  activeNames: string[];
} {
  const tools: Record<string, ReturnType<typeof dynamicTool>> = {};
  const activeNames: string[] = [];

  if (raw == null || typeof raw !== 'object') {
    return { tools, activeNames: [] };
  }

  for (const [mapKey, entry] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    const tool = entry as AgentCustomApiToolEntry;
    if (tool.enabled === false) continue;
    if (tool.type !== 'api') continue;
    const cfg = tool.config;
    if (!cfg?.url || typeof cfg.url !== 'string') continue;

    const method = (cfg.httpMethod ?? 'GET').toUpperCase();
    const label = tool.name || tool.id || mapKey;
    const internalKey = `${label}_${mapKey}`.replace(/\s+/g, '_');
    const toolName = sanitizeModelToolName(internalKey, usedModelToolNames);

    const useQuery = needsQueryPlaceholder(tool);
    const inputSchema = useQuery
      ? z.object({
          query: z
            .string()
            .describe(
              'Search or filter text substituted for {query} in the API configuration.',
            ),
        })
      : z.object({});

    const description =
      tool.description?.trim() ||
      `HTTP API tool: ${label} (${method} ${cfg.url})`;

    tools[toolName] = dynamicTool({
      description,
      inputSchema,
      execute: async (args: unknown) => {
        const a = args as { query?: string };
        let target: URL;
        try {
          target = new URL(cfg.url as string);
        } catch {
          throw new Error(`Invalid tool URL for ${label}`);
        }

        for (const p of cfg.queryParams ?? []) {
          if (!p.key) continue;
          const v = substitutePlaceholders(String(p.value ?? ''), a);
          target.searchParams.append(p.key, v);
        }

        const headers: Record<string, string> = {
          accept: 'application/json, text/plain;q=0.9,*/*;q=0.8',
          ...buildAuthHeaders(cfg.authType, cfg.apiKey),
        };

        let body: string | undefined;
        if (method !== 'GET' && method !== 'HEAD' && (cfg.bodyParams?.length ?? 0) > 0) {
          const obj: Record<string, string> = {};
          for (const p of cfg.bodyParams ?? []) {
            if (!p.key) continue;
            obj[p.key] = substitutePlaceholders(String(p.value ?? ''), a);
          }
          headers['content-type'] = 'application/json';
          body = JSON.stringify(obj);
        }

        const res = await fetch(target.toString(), {
          method,
          headers,
          body,
          signal: AbortSignal.timeout(60_000),
        });

        const text = await res.text();
        if (!res.ok) {
          return {
            ok: false,
            status: res.status,
            body: text.slice(0, 8000),
          };
        }
        try {
          return JSON.parse(text) as unknown;
        } catch {
          return { raw: text.slice(0, 8000) };
        }
      },
    });

    activeNames.push(toolName);
  }

  return { tools, activeNames };
}

/** Strip secrets from agent tools for request logging. */
export function redactAgentToolsForLog(raw: unknown): unknown {
  if (raw == null || typeof raw !== 'object') return raw;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null || typeof v !== 'object') {
      out[k] = v;
      continue;
    }
    const t = v as AgentCustomApiToolEntry;
    const cfg = t.config;
    out[k] = {
      ...t,
      config: cfg
        ? {
            ...cfg,
            apiKey: cfg.apiKey ? '[redacted]' : undefined,
          }
        : cfg,
    };
  }
  return out;
}
