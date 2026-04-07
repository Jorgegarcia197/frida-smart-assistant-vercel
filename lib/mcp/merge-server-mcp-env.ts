/**
 * Merges optional server env fallbacks into agent MCP config.
 * - `MCP_SSE_URL` / `MCP_X_API_KEY`: only used when the agent omits `url` / `x-api-key`.
 * - DB headers (`x-db-url`, `x-db-host`, …) are **passed through** by default so the MCP
 *   server can connect to the database (many MCPs require them on each request).
 * - Set `MCP_STRIP_DB_HEADERS=true` if the DB is configured only on the MCP container
 *   and you must not forward DB headers from the agent payload.
 */

const DB_HEADER_KEYS = [
  'x-db-url',
  'x-db-host',
  'x-db-user',
  'x-db-pass',
  'x-db-name',
] as const;

function isSseLikeConfig(cfg: Record<string, unknown>): boolean {
  if (cfg.transportType === 'sse') return true;
  return typeof cfg.url === 'string' && cfg.url.length > 0;
}

function hasUrl(cfg: Record<string, unknown>): boolean {
  return typeof cfg.url === 'string' && cfg.url.trim().length > 0;
}

/**
 * Applies MCP_SSE_URL / MCP_X_API_KEY fallbacks; optionally strips DB headers when
 * `MCP_STRIP_DB_HEADERS=true`.
 */
export function applyServerMcpSecretsFromEnv(agentMcpConfig: unknown): unknown {
  if (
    !agentMcpConfig ||
    typeof agentMcpConfig !== 'object' ||
    !('mcpServers' in agentMcpConfig)
  ) {
    return agentMcpConfig;
  }

  const raw = agentMcpConfig as { mcpServers?: Record<string, unknown> };
  if (!raw.mcpServers || typeof raw.mcpServers !== 'object') {
    return agentMcpConfig;
  }

  const fallbackUrl = process.env.MCP_SSE_URL?.trim();
  const fallbackApiKey = process.env.MCP_X_API_KEY?.trim();
  const stripDbHeaders =
    process.env.MCP_STRIP_DB_HEADERS === 'true' ||
    process.env.MCP_STRIP_DB_HEADERS === '1';

  const mcpServers: Record<string, unknown> = { ...raw.mcpServers };

  for (const [name, serverRaw] of Object.entries(raw.mcpServers)) {
    if (!serverRaw || typeof serverRaw !== 'object') continue;
    const cfg = { ...(serverRaw as Record<string, unknown>) };
    if (!isSseLikeConfig(cfg)) {
      mcpServers[name] = cfg;
      continue;
    }

    const env = {
      ...((cfg.env as Record<string, string> | undefined) ?? {}),
    };
    if (stripDbHeaders) {
      for (const k of DB_HEADER_KEYS) {
        delete env[k];
      }
    }

    const existingKey = env['x-api-key']?.trim();
    if (!existingKey && fallbackApiKey) {
      env['x-api-key'] = fallbackApiKey;
    }

    cfg.env = Object.keys(env).length > 0 ? env : undefined;

    if (!hasUrl(cfg) && fallbackUrl) {
      cfg.url = fallbackUrl;
    }

    mcpServers[name] = cfg;
  }

  return { ...raw, mcpServers };
}

/** Safe for console: replaces env values so logs do not leak secrets. */
export function redactMcpConfigForLog(config: unknown): unknown {
  if (
    !config ||
    typeof config !== 'object' ||
    !('mcpServers' in config)
  ) {
    return config;
  }
  const c = config as { mcpServers?: Record<string, unknown> };
  if (!c.mcpServers || typeof c.mcpServers !== 'object') {
    return config;
  }
  const servers: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(c.mcpServers)) {
    if (!raw || typeof raw !== 'object') {
      servers[name] = raw;
      continue;
    }
    const srv = { ...(raw as Record<string, unknown>) };
    if (srv.env && typeof srv.env === 'object') {
      const env: Record<string, string> = {};
      for (const k of Object.keys(srv.env as Record<string, string>)) {
        env[k] = '[redacted]';
      }
      srv.env = env;
    }
    servers[name] = srv;
  }
  return { ...c, mcpServers: servers };
}
