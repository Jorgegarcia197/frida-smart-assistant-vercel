/**
 * MCP tools via @ai-sdk/mcp (see https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools).
 * SSE servers use createMCPClient + transport { type: 'sse', url, headers, redirect: 'error' }.
 *
 * `createMCPClient().tools()` already builds each tool with the MCP `inputSchema` (required
 * fields, additionalProperties: false). We only re-wrap to sanitize the tool *name* for Bedrock;
 * we must keep that schema — a previous loose `z.preprocess(..., {})` let empty `{}` calls through,
 * which broke servers that require arguments (e.g. `query` on `execute_query`).
 */
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import type { FlexibleSchema } from '@ai-sdk/provider-utils';
import { dynamicTool } from 'ai';
import { z } from 'zod/v3';

type McpSourceTool = {
  description?: string;
  title?: string;
  inputSchema?: FlexibleSchema<unknown>;
  execute?: (args: unknown, options: unknown) => Promise<unknown>;
  toModelOutput?: (options: {
    toolCallId: string;
    input: unknown;
    output: unknown;
  }) => unknown;
};

function wrapMcpToolForBedrock(
  bedrockName: string,
  sourceTool: unknown,
) {
  const t = sourceTool as McpSourceTool;
  const executeInner = t.execute;
  if (!executeInner) {
    throw new Error(`MCP tool ${bedrockName} has no execute`);
  }
  const bound = executeInner.bind(sourceTool);

  if (!t.inputSchema) {
    console.warn(
      `[AI SDK MCP] Tool "${bedrockName}" has no inputSchema; using loose record (prefer fixing MCP server schema).`,
    );
  }

  return dynamicTool({
    description: t.description ?? `MCP tool ${bedrockName}`,
    ...(t.title ? { title: t.title } : {}),
    inputSchema: t.inputSchema ?? z.record(z.string(), z.unknown()),
    execute: async (args: unknown) => {
      const input =
        args !== null &&
        args !== undefined &&
        typeof args === 'object' &&
        !Array.isArray(args)
          ? (args as Record<string, unknown>)
          : {};
      return bound(input, {
        toolCallId: bedrockName,
        messages: [],
      });
    },
    ...(t.toModelOutput
      ? { toModelOutput: t.toModelOutput.bind(sourceTool) }
      : {}),
  });
}

export function isSseMcpServerConfig(cfg: Record<string, unknown>): boolean {
  if (cfg.transportType === 'stdio') return false;
  if (typeof (cfg as { command?: string }).command === 'string') return false;
  return typeof cfg.url === 'string' && cfg.url.trim().length > 0;
}

/** Agent/user mcpServers entries that should use the legacy MCPClient (stdio, etc.). */
export function filterToNonSseMcpServers(
  mcpServers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!mcpServers || typeof mcpServers !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(mcpServers)) {
    if (!raw || typeof raw !== 'object') continue;
    const cfg = raw as Record<string, unknown>;
    if (isSseMcpServerConfig(cfg)) continue;
    out[name] = raw;
  }
  return out;
}

export async function collectAiSdkSseMcpTools(
  mcpServers: Record<string, unknown> | undefined,
  sanitizeBedrockToolName: (raw: string, used: Set<string>) => string,
  /** Shared with legacy MCPClient tools to avoid Bedrock name collisions. */
  bedrockToolNames: Set<string>,
): Promise<{
  mcpTools: Record<string, unknown>;
  mcpActiveTools: string[];
  closeClients: () => Promise<void>;
}> {
  const empty = {
    mcpTools: {} as Record<string, unknown>,
    mcpActiveTools: [] as string[],
    closeClients: async () => {},
  };

  if (!mcpServers || typeof mcpServers !== 'object') {
    return empty;
  }

  const clients: MCPClient[] = [];
  const mcpTools: Record<string, unknown> = {};
  const mcpActiveTools: string[] = [];

  for (const [serverName, raw] of Object.entries(mcpServers)) {
    if (!raw || typeof raw !== 'object') continue;
    const cfg = raw as Record<string, unknown>;
    if (!isSseMcpServerConfig(cfg)) continue;
    if (cfg.disabled === true) continue;

    const url = String(cfg.url).trim();
    const env = (cfg.env as Record<string, string> | undefined) ?? {};
    const headers: Record<string, string> = { ...env };

    try {
      const client = await createMCPClient({
        transport: {
          type: 'sse',
          url,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          redirect: 'error',
        },
      });
      clients.push(client);

      const tools = await client.tools();
      for (const [toolName, tool] of Object.entries(tools)) {
        const internalName = `${serverName}__${toolName}`;
        const bedrockName = sanitizeBedrockToolName(internalName, bedrockToolNames);
        mcpTools[bedrockName] = wrapMcpToolForBedrock(bedrockName, tool);
        mcpActiveTools.push(bedrockName);
      }
    } catch (error) {
      console.error(
        `[AI SDK MCP] SSE server "${serverName}" failed to connect or list tools:`,
        error,
      );
    }
  }

  return {
    mcpTools,
    mcpActiveTools,
    closeClients: async () => {
      await Promise.allSettled(clients.map((c) => c.close()));
    },
  };
}
