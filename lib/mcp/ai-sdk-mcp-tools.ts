/**
 * MCP tools via @ai-sdk/mcp (see https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools).
 * Remote servers use `createMCPClient` with `transport: { type: 'sse' | 'http', url, headers, redirect: 'error' }`.
 *
 * `createMCPClient().tools()` already builds each tool with the MCP `inputSchema` (required
 * fields, additionalProperties: false). We re-wrap to apply a **model-facing tool id** (sanitized
 * for strict providers, originally AWS Bedrock limits) while keeping that schema — a previous
 * loose `z.preprocess(..., {})` let empty `{}` calls through,
 * which broke servers that require arguments (e.g. `query` on `execute_query`).
 * We run `safeValidateTypes` on the incoming args before `execute` reaches the MCP server so
 * OpenAI-compatible gateways that emit `{}` get a fast tool error instead of a Pydantic failure.
 * If the MCP JSON Schema lists `properties` but omits `required`/`minProperties`, we infer that at
 * least one property must be non-empty (generic for any agent/tool, not SQL-specific).
 */
import type { JSONSchema7 } from '@ai-sdk/provider';
import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import {
  asSchema,
  type FlexibleSchema,
  safeValidateTypes,
  type ToolResultOutput,
} from '@ai-sdk/provider-utils';
import { dynamicTool } from 'ai';
import { z } from 'zod/v3';

import type { McpTransportType } from '@/lib/mcp/types';

const MCP_LOG_MAX_CHARS = 12_000;

function stringifyForMcpLog(value: unknown): string {
  try {
    const s = JSON.stringify(value, null, 0);
    if (s.length <= MCP_LOG_MAX_CHARS) return s;
    return `${s.slice(0, MCP_LOG_MAX_CHARS)}… [truncated ${s.length - MCP_LOG_MAX_CHARS} chars]`;
  } catch {
    return String(value);
  }
}

/** Stable key for per-request dedupe when the model repeats the same MCP call with `{}` → repair. */
function normalizedMcpPayloadKey(payload: Record<string, unknown>): string {
  const out: Record<string, unknown> = { ...payload };
  const q = out.query;
  if (typeof q === 'string' && q.trim().startsWith('{')) {
    try {
      out.query = JSON.stringify(JSON.parse(q));
    } catch {
      /* keep */
    }
  }
  return JSON.stringify(out);
}

type McpSourceTool = {
  description?: string;
  title?: string;
  inputSchema?: FlexibleSchema<unknown>;
  execute?: (args: unknown, options: unknown) => Promise<unknown>;
  toModelOutput?: (options: {
    toolCallId: string;
    input: unknown;
    output: unknown;
  }) => ToolResultOutput | PromiseLike<ToolResultOutput>;
};

async function getInputJsonSchema(
  flexible: FlexibleSchema<unknown>,
): Promise<JSONSchema7 | undefined> {
  try {
    const s = asSchema(flexible);
    return await Promise.resolve(s.jsonSchema);
  } catch {
    return undefined;
  }
}

/**
 * Many MCP servers list `properties` but omit `required` / `minProperties`. JSON Schema then
 * accepts `{}`, while the server (e.g. Pydantic) still expects arguments.
 *
 * When we see an object schema with at least one property, no `required`, and no `minProperties`,
 * infer that **at least one** declared property must be present with a non-empty value.
 *
 * Skips composite schemas (`allOf` / `oneOf` / `$ref`) to avoid false positives.
 */
function emptyPayloadViolatesInferredNonEmptyObject(
  schema: JSONSchema7,
  payload: Record<string, unknown>,
): boolean {
  if (schema.allOf || schema.anyOf || schema.oneOf || schema.not || schema.$ref) {
    return false;
  }

  const props = schema.properties;
  if (!props || typeof props !== 'object') return false;
  const propKeys = Object.keys(props);
  if (propKeys.length === 0) return false;

  const required = schema.required;
  if (Array.isArray(required) && required.length > 0) return false;

  if (typeof schema.minProperties === 'number' && schema.minProperties >= 1) {
    return false;
  }

  const hasMeaningfulValue = Object.keys(payload).some((key) => {
    const v = payload[key];
    if (v === undefined) return false;
    if (v === null) return false;
    if (typeof v === 'string' && v.trim().length === 0) return false;
    return true;
  });

  return !hasMeaningfulValue;
}

function inferredNonEmptyArgsMessage(
  modelToolName: string,
  schema: JSONSchema7,
): string {
  const keys = schema.properties
    ? Object.keys(schema.properties as Record<string, unknown>)
    : [];
  const list = keys.length > 0 ? keys.map((k) => `\`${k}\``).join(', ') : 'see tool schema';
  return `This tool declares input fields (${list}) but the MCP schema omits a \`required\` list. At least one of these properties must be set to a non-empty value. Do not call \`${modelToolName}\` with \`{}\` or only empty strings.`;
}

function wrapAiSdkMcpTool(
  modelToolName: string,
  sourceTool: unknown,
  /** Same chat request only: avoids duplicate MCP round-trips when the model retries with `{}`. */
  dedupeByNormalizedInput?: Map<string, unknown>,
) {
  const t = sourceTool as McpSourceTool;
  const executeInner = t.execute;
  if (!executeInner) {
    throw new Error(`MCP tool ${modelToolName} has no execute`);
  }
  const bound = executeInner.bind(sourceTool);

  if (!t.inputSchema) {
    console.warn(
      `[AI SDK MCP] Tool "${modelToolName}" has no inputSchema; using loose record (prefer fixing MCP server schema).`,
    );
  }

  return dynamicTool({
    description: t.description ?? `MCP tool ${modelToolName}`,
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
      console.log(
        `[AI SDK MCP] call ${modelToolName} input:`,
        stringifyForMcpLog(input),
      );

      // The OpenAI-compatible gateway can emit `{}` for tools that declare required JSON
      // properties. Validate against the MCP tool schema *before* calling the server so we
      // return a clear tool error the model can correct (same shapes as MCP `isError` results).
      let payload: Record<string, unknown> = input;
      if (t.inputSchema) {
        const validation = await safeValidateTypes({
          value: input,
          schema: t.inputSchema,
          context: { entityName: modelToolName },
        });
        if (!validation.success) {
          const detail = validation.error.message;
          console.warn(
            `[AI SDK MCP] blocked ${modelToolName} (input failed schema, not calling MCP):`,
            detail,
          );
          return {
            content: [
              {
                type: 'text' as const,
                text: `Invalid tool arguments (failed JSON schema validation before MCP): ${detail}. Fix: include every required property with a real value (do not send an empty object when the schema lists required fields).`,
              },
            ],
            isError: true,
          };
        }
        payload = validation.value as Record<string, unknown>;
      }

      if (t.inputSchema) {
        const jsonSchema = await getInputJsonSchema(t.inputSchema);
        if (
          jsonSchema &&
          emptyPayloadViolatesInferredNonEmptyObject(jsonSchema, payload)
        ) {
          const msg = inferredNonEmptyArgsMessage(modelToolName, jsonSchema);
          console.warn(
            `[AI SDK MCP] blocked ${modelToolName} (inferred non-empty args from JSON Schema, not calling MCP):`,
            msg,
          );
          return {
            content: [{ type: 'text' as const, text: `Invalid tool arguments: ${msg}` }],
            isError: true,
          };
        }
      }

      try {
        const dedupeKey = `${modelToolName}\n${normalizedMcpPayloadKey(payload)}`;
        if (dedupeByNormalizedInput?.has(dedupeKey)) {
          const cached = dedupeByNormalizedInput.get(dedupeKey);
          return structuredClone(cached) as Awaited<ReturnType<typeof bound>>;
        }

        const result = await bound(payload, {
          toolCallId: modelToolName,
          messages: [],
        });
        try {
          dedupeByNormalizedInput?.set(dedupeKey, structuredClone(result));
        } catch {
          /* non-cloneable payload — skip cache */
        }
        console.log(
          `[AI SDK MCP] ok ${modelToolName} result:`,
          stringifyForMcpLog(result),
        );
        return result;
      } catch (error) {
        console.error(`[AI SDK MCP] error ${modelToolName}:`, error);
        throw error;
      }
    },
    ...(t.toModelOutput
      ? { toModelOutput: t.toModelOutput.bind(sourceTool) }
      : {}),
  });
}

/**
 * Resolves logical transport from agent/user hub config.
 * Agent Builder may send `transportType: 'streamable-http'` — normalized to `'http'` for AI SDK.
 */
export function resolveTransportType(
  cfg: Record<string, unknown>,
): McpTransportType | null {
  const explicit = cfg.transportType;
  if (explicit === 'sse') return 'sse';
  if (explicit === 'http' || explicit === 'streamable-http') return 'http';
  if (explicit === 'stdio') return 'stdio';

  if (typeof (cfg as { command?: string }).command === 'string') return 'stdio';
  if (typeof cfg.url === 'string' && cfg.url.trim().length > 0) return 'sse';
  return null;
}

/** Agent/user mcpServers entries that should use the legacy MCPClient (stdio, etc.). */
export function filterToLegacyMcpServers(
  mcpServers: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!mcpServers || typeof mcpServers !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [name, raw] of Object.entries(mcpServers)) {
    if (!raw || typeof raw !== 'object') continue;
    const t = resolveTransportType(raw as Record<string, unknown>);
    if (t === 'sse' || t === 'http') continue;
    out[name] = raw;
  }
  return out;
}

export async function collectAiSdkMcpTools(
  mcpServers: Record<string, unknown> | undefined,
  sanitizeModelToolName: (raw: string, used: Set<string>) => string,
  /** Shared with legacy MCPClient tools to keep model-facing tool ids unique. */
  usedModelToolNames: Set<string>,
  dedupeByNormalizedInput?: Map<string, unknown>,
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
    const transportKind = resolveTransportType(cfg);
    if (transportKind !== 'sse' && transportKind !== 'http') continue;
    if (cfg.disabled === true) continue;

    const url = String(cfg.url).trim();
    const env = (cfg.env as Record<string, string> | undefined) ?? {};
    const headers: Record<string, string> = { ...env };

    const aiSdkTransportType = transportKind === 'http' ? 'http' : 'sse';

    console.log(
      `[AI SDK MCP] Connecting "${serverName}": transport=${aiSdkTransportType}, url=${url}`,
    );

    try {
      const client = await createMCPClient({
        transport: {
          type: aiSdkTransportType,
          url,
          ...(Object.keys(headers).length > 0 ? { headers } : {}),
          redirect: 'error',
        },
      });
      clients.push(client);

      const tools = await client.tools();
      for (const [toolName, tool] of Object.entries(tools)) {
        const internalName = `${serverName}__${toolName}`;
        const modelToolName = sanitizeModelToolName(
          internalName,
          usedModelToolNames,
        );
        mcpTools[modelToolName] = wrapAiSdkMcpTool(
          modelToolName,
          tool,
          dedupeByNormalizedInput,
        );
        mcpActiveTools.push(modelToolName);
      }
    } catch (error) {
      console.error(
        `[AI SDK MCP] Remote server "${serverName}" (${aiSdkTransportType}) failed to connect or list tools:`,
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
