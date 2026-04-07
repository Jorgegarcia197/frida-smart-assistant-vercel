/**
 * Maps agent builder `mcps` payloads into the shape expected by the chat MCP client:
 * `{ mcpServers: { [name]: { transportType, url, env? } } }`.
 *
 * Supports:
 * - Already-normalized `{ mcpServers: ... }` (pass-through)
 * - Cursor-style nested `tools: [[{ type: "mcp", server_label, server_url, headers }]]`
 */

function headersToEnv(headers: unknown): Record<string, string> {
  const env: Record<string, string> = {};
  if (!headers) return env;
  if (Array.isArray(headers)) {
    for (const pair of headers) {
      if (Array.isArray(pair) && pair.length >= 2) {
        env[String(pair[0])] = String(pair[1]);
      }
    }
    return env;
  }
  if (typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers as Record<string, unknown>)) {
      env[k] = String(v ?? '');
    }
  }
  return env;
}

export function normalizeAgentMcps(mcps: unknown): unknown {
  if (mcps == null || typeof mcps !== 'object') {
    return mcps;
  }

  const root = mcps as Record<string, unknown>;
  if (root.mcpServers && typeof root.mcpServers === 'object') {
    return mcps;
  }

  const tools = root.tools;
  if (!Array.isArray(tools)) {
    return mcps;
  }

  const mcpServers: Record<string, unknown> = {};

  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const x of node) {
        visit(x);
      }
      return;
    }
    if (!node || typeof node !== 'object') return;
    const t = node as Record<string, unknown>;
    if (t.type === 'mcp') {
      const label = String(t.server_label ?? 'mcp_server');
      const url = t.server_url;
      const env = headersToEnv(t.headers);
      mcpServers[label] = {
        transportType: 'sse',
        url,
        ...(Object.keys(env).length > 0 ? { env } : {}),
      };
    }
  };

  visit(tools);

  if (Object.keys(mcpServers).length === 0) {
    return mcps;
  }

  return { mcpServers };
}
