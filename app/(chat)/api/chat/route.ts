import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  JsonToSseTransformStream,
  dynamicTool,
} from 'ai';
import { createMcpToolCallRepair } from '@/lib/ai/mcp-tool-call-repair';
import { pipeJsonRender } from '@json-render/core';
import { auth } from '@/app/(auth)/auth';
import {
  type RequestHints,
  buildEffectiveSystemPrompt,
  buildSystemPromptSections,
  dumpSystemPrompt,
  joinSystemPromptSections,
} from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
  mergeChatAgentFields,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { convertToUIMessages, generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { createIshikawaDiagram } from '@/lib/ai/tools/create-ishikawa-diagram';
import { createMermaidDiagram } from '@/lib/ai/tools/create-mermaid-diagram';
import { updateAgentTasks } from '@/lib/ai/tools/update-agent-tasks';
import { renderHostMap } from '@/lib/ai/tools/render-host-map';
import { expandFilePartsForModel } from '@/lib/ai/expand-file-parts-for-model';
import {
  myProvider,
  resolveConfiguredLanguageModelId,
} from '@/lib/ai/providers';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { normalizeAgentMcps } from '@/lib/agents/normalize-agent-mcps';
import {
  applyServerMcpSecretsFromEnv,
  redactMcpConfigForLog,
} from '@/lib/mcp/merge-server-mcp-env';
import {
  collectAiSdkMcpTools,
  filterToLegacyMcpServers,
} from '@/lib/mcp/ai-sdk-mcp-tools';
import {
  buildAgentCustomApiTools,
  redactAgentToolsForLog,
} from '@/lib/ai/tools/agent-custom-api-tools';
import { buildAgentComputerUseTools } from '@/lib/ai/tools/agent-computer-use-tools';
import { z } from 'zod/v3';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/firebase-types';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import type { ChatMessage } from '@/lib/types';

export const maxDuration = 60;
const DEBUG_OPENAI_COMPATIBLE = process.env.DEBUG_OPENAI_COMPATIBLE === 'true';
/** Log each `streamText` chunk (text-delta, tool-call, etc.) to the server terminal. */
const DEBUG_CHAT_STREAM_CHUNKS = process.env.DEBUG_CHAT_STREAM_CHUNKS === 'true';
/** Log tool call lifecycle, passthrough executes, and tool-related stream chunks in POST /api/chat. */
const DEBUG_CHAT_TOOLS = process.env.DEBUG_CHAT_TOOLS === 'true';
/**
 * In `next dev`, verbose tool logs are on unless `DEBUG_CHAT_TOOLS=false`.
 * In production, only `DEBUG_CHAT_TOOLS=true` enables them.
 */
const CHAT_TOOLS_VERBOSE =
  DEBUG_CHAT_TOOLS ||
  (process.env.NODE_ENV === 'development' &&
    process.env.DEBUG_CHAT_TOOLS !== 'false');

function truncateForDebugLog(value: unknown, maxChars = 12000): string {
  try {
    const s =
      typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    if (s.length <= maxChars) return s;
    return `${s.slice(0, maxChars)}\n… [truncated ${s.length - maxChars} more chars]`;
  } catch {
    return String(value);
  }
}

/** Aligns with `hasError` heuristics in components/tool-card.tsx for surfacing provider failures. */
function toolOutputLooksProblematic(output: unknown): boolean {
  if (output == null) return false;
  if (typeof output !== 'object') return false;
  const o = output as Record<string, unknown>;
  if (o.isError === true) return true;
  if (
    'error' in o &&
    o.error != null &&
    String(o.error).trim() !== ''
  ) {
    return true;
  }
  const content = o.content;
  if (Array.isArray(content)) {
    return content.some(
      (c: unknown) =>
        c != null &&
        typeof c === 'object' &&
        (c as { type?: string; text?: string }).type === 'text' &&
        typeof (c as { text?: string }).text === 'string' &&
        (c as { text: string }).text.toLowerCase().includes('error'),
    );
  }
  return false;
}

type AnthropicSkillConfig = {
  type: 'anthropic';
  skillId: string;
  version?: string;
};

type AnthropicExtensionsConfig = {
  enableCodeExecution: boolean;
  container?: {
    skills: AnthropicSkillConfig[];
  };
  betas?: string[];
};

const DEFAULT_ANTHROPIC_SKILLS: AnthropicSkillConfig[] = [
  { type: 'anthropic', skillId: 'pptx', version: 'latest' },
  { type: 'anthropic', skillId: 'docx', version: 'latest' },
  { type: 'anthropic', skillId: 'pdf', version: 'latest' },
  { type: 'anthropic', skillId: 'xlsx', version: 'latest' },
];

function parseCsvEnv(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseAnthropicSkillsEnv(value: string | undefined): AnthropicSkillConfig[] {
  const skills: AnthropicSkillConfig[] = [];

  for (const token of parseCsvEnv(value)) {
    const [rawSkillId, rawVersion] = token.split('@');
    const skillId = rawSkillId?.trim();
    if (!skillId) continue;

    const version = rawVersion?.trim();
    skills.push({
      type: 'anthropic',
      skillId,
      ...(version ? { version } : { version: 'latest' }),
    });
  }

  return skills;
}

/**
 * Enables Anthropic code execution + skills on the compatible API when:
 * - the configured model id looks like Claude, or
 * - the user picked the reasoning chat preset (`chat-model-reasoning`), which often maps to
 *   Claude via env even when `REASONING_MODEL` omits the substring `claude`.
 */
function getAnthropicExtensionsForModel(
  resolvedModelId: string,
  selectedChatModel: string,
): AnthropicExtensionsConfig | undefined {
  const enableCodeExecution =
    process.env.ANTHROPIC_ENABLE_CODE_EXECUTION !== 'false';
  if (!enableCodeExecution) return undefined;

  const isClaudeModel = resolvedModelId.toLowerCase().includes('claude');
  const isReasoningChatPreset = selectedChatModel === 'chat-model-reasoning';
  if (!isClaudeModel && !isReasoningChatPreset) return undefined;

  const configuredSkills = parseAnthropicSkillsEnv(process.env.ANTHROPIC_SKILLS);
  const skills =
    configuredSkills.length > 0 ? configuredSkills : DEFAULT_ANTHROPIC_SKILLS;
  const extraBetas = parseCsvEnv(process.env.ANTHROPIC_EXTENSION_BETAS);

  return {
    enableCodeExecution,
    container: { skills },
    ...(extraBetas.length > 0 ? { betas: extraBetas } : {}),
  };
}

function isNativeFileSkillsRequest(
  parts: Array<{ type: string; text?: string }>,
): boolean {
  const combinedText = parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text ?? '')
    .join(' ')
    .toLowerCase();

  if (!combinedText) return false;

  const fileTypeRegex =
    /\b(pdf|pptx|docx|xlsx|powerpoint|word document|excel|spreadsheet)\b/i;
  const intentRegex = /\b(create|generate|make|build|export|produce)\b/i;

  return fileTypeRegex.test(combinedText) && intentRegex.test(combinedText);
}

function createAnthropicSkillsPassthroughTools() {
  const passthroughSchema = z.object({}).passthrough();

  const passthroughExecute = async (args: unknown) => {
    if (CHAT_TOOLS_VERBOSE) {
      console.log('🔧 [chat-tools] anthropic passthrough execute (local SDK)', {
        preview: truncateForDebugLog(args, 8000),
      });
    }
    if (args && typeof args === 'object' && '_result' in (args as object)) {
      return (args as { _result: unknown })._result;
    }
    return {
      delegated: true,
      note: 'Handled by Anthropic skills backend',
      args,
    };
  };

  return {
    text_editor_code_execution: dynamicTool({
      description:
        'Anthropic text editor code execution passthrough (server-side execution).',
      inputSchema: passthroughSchema,
      execute: passthroughExecute,
    }),
    bash_code_execution: dynamicTool({
      description:
        'Anthropic bash code execution passthrough (server-side execution).',
      inputSchema: passthroughSchema,
      execute: passthroughExecute,
    }),
    code_execution: dynamicTool({
      description: 'Anthropic code execution passthrough (server-side execution).',
      inputSchema: passthroughSchema,
      execute: passthroughExecute,
    }),
  } as const;
}

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
}

// Helper function to convert JSON Schema to Zod object schema
function jsonSchemaToZodObject(jsonSchema: any): z.ZodObject<any> {
  if (!jsonSchema || typeof jsonSchema !== 'object') {
    return z.object({});
  }

  const { properties, required = [] } = jsonSchema;

  if (properties && typeof properties === 'object') {
    const zodFields: Record<string, z.ZodTypeAny> = {};

    for (const [key, value] of Object.entries(properties)) {
      let fieldSchema = jsonSchemaPropertyToZod(value as any);

      // Handle optional fields
      if (!required.includes(key)) {
        fieldSchema = fieldSchema.optional();
      }

      zodFields[key] = fieldSchema;
    }

    return Object.keys(zodFields).length > 0
      ? z.object(zodFields)
      : z.object({});
  }

  return z.object({});
}

// Helper function to convert a JSON Schema property to Zod type
function jsonSchemaPropertyToZod(property: any): z.ZodTypeAny {
  if (!property || typeof property !== 'object') {
    return z.any();
  }

  const { type, items } = property;

  switch (type) {
    case 'string':
      return z.string();
    case 'number':
      return z.number();
    case 'integer':
      return z.number().int();
    case 'boolean':
      return z.boolean();
    case 'array':
      if (items) {
        return z.array(jsonSchemaPropertyToZod(items));
      }
      return z.array(z.any());
    case 'object':
      return jsonSchemaToZodObject(property);
    default:
      return z.any();
  }
}

/** Model-facing tool ids (strict providers, e.g. AWS Bedrock): [a-zA-Z0-9_-]+, max 64, start with a letter. */
function sanitizeModelToolName(raw: string, used: Set<string>): string {
  // MCP tools use `server__tool` (`collectAiSdkMcpTools`). Do not collapse `__` to `_` or the UI
  // cannot tell MCP from agent API tools — sanitize each segment and rejoin.
  const MCP_SEGMENT_JOIN = '__';
  const segments = raw.split(MCP_SEGMENT_JOIN);
  let s = segments
    .map((segment) =>
      segment.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_'),
    )
    .join(MCP_SEGMENT_JOIN);
  if (!/^[a-zA-Z]/.test(s)) {
    s = `t_${s}`;
  }
  s = s.slice(0, 64);
  let candidate = s || 'tool';
  let n = 0;
  while (used.has(candidate)) {
    n += 1;
    const suffix = `_${n}`;
    candidate = `${s.slice(0, Math.max(1, 64 - suffix.length))}${suffix}`;
  }
  used.add(candidate);
  return candidate;
}

// Helper function to get MCP tools for the AI SDK
async function getMcpToolsForAI(
  userId: string,
  agentMcpConfig?: any,
  agentKnowledgeBaseIds?: string[],
  agentToolsConfig?: unknown,
  /** Per HTTP request: dedupe identical AI SDK MCP executes when the model retries with `{}`. */
  mcpToolDedupeByInput?: Map<string, unknown>,
  /** Chat id for E2B desktop session scoping (Frida `computer-use` tool). */
  chatId?: string,
): Promise<{
  mcpTools: Record<string, any>;
  mcpActiveTools: string[];
  closeAiSdkMcpClients: () => Promise<void>;
  computerUseRegistered: boolean;
}> {
  const mcpTools: Record<string, any> = {};
  const mcpActiveTools: string[] = [];
  const usedModelToolNames = new Set<string>();
  let closeAiSdkMcpClients: () => Promise<void> = async () => {};
  let computerUseRegistered = false;

  try {
    const resolvedAgentMcp = applyServerMcpSecretsFromEnv(
      normalizeAgentMcps(agentMcpConfig),
    ) as typeof agentMcpConfig;

    console.log('🔧 Getting MCP client instance for user:', userId);
    console.log(
      '🔧 Agent MCP config (resolved, redacted):',
      redactMcpConfigForLog(resolvedAgentMcp),
    );
    console.log('🔧 Agent knowledge base IDs:', agentKnowledgeBaseIds);
    console.log(
      '🔧 Agent custom API tools (redacted):',
      redactAgentToolsForLog(agentToolsConfig),
    );

    const mcpServersResolved = resolvedAgentMcp?.mcpServers as
      | Record<string, unknown>
      | undefined;

    // Remote MCP (sse / http): @ai-sdk/mcp createMCPClient (https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
    const aiSdkResult = await collectAiSdkMcpTools(
      mcpServersResolved,
      sanitizeModelToolName,
      usedModelToolNames,
      mcpToolDedupeByInput,
    );
    Object.assign(mcpTools, aiSdkResult.mcpTools);
    mcpActiveTools.push(...aiSdkResult.mcpActiveTools);
    closeAiSdkMcpClients = aiSdkResult.closeClients;

    const mcpClient = getMcpClientInstance(userId);

    const hasAgentMcpServers =
      resolvedAgentMcp?.mcpServers &&
      typeof resolvedAgentMcp.mcpServers === 'object' &&
      Object.keys(resolvedAgentMcp.mcpServers).length > 0;

    const legacyAgentMcpOnly = hasAgentMcpServers
      ? { mcpServers: filterToLegacyMcpServers(mcpServersResolved) }
      : undefined;

    // Initialize or merge when there are no connections yet, or when the loaded agent
    // defines MCP servers (must merge even if the user already had hub connections).
    // Agent sse/http entries are handled above via @ai-sdk/mcp; only stdio/legacy merge here.
    if (mcpClient.connections.length === 0 || hasAgentMcpServers) {
      console.log(
        '🔧 Initializing legacy MCP client (stdio / hub, non-remote-AI-SDK agent entries):',
        hasAgentMcpServers
          ? 'merging legacy agent mcpServers with user config'
          : 'from user config only',
      );
      try {
        if (hasAgentMcpServers) {
          await mcpClient.initializeMcpServersWithAgentConfig(
            legacyAgentMcpOnly ?? { mcpServers: {} },
          );
        } else {
          await mcpClient.initializeMcpServers();
        }
        console.log('✅ MCP servers initialization completed');
      } catch (initError) {
        console.warn('⚠️ MCP server initialization failed:', initError);
        // Continue anyway, might have some cached connections
      }
    } else {
      console.log('✅ Using existing MCP connections');
    }

    // Get all connected and enabled servers
    const servers = mcpClient.getServers();
    console.log(
      '🔧 All MCP servers:',
      servers.map((s) => ({
        name: s.name,
        status: s.status,
        disabled: s.disabled,
        hasTools: !!s.tools,
      })),
    );

    const enabledServers = servers.filter(
      (server) =>
        !server.disabled &&
        server.status === 'connected' &&
        server.tools &&
        server.tools.length > 0,
    );

    console.log(
      '🔧 Available MCP servers:',
      enabledServers.map((s) => s.name),
    );

    const hasAnyAiSdkTools = aiSdkResult.mcpActiveTools.length > 0;
    if (
      hasAgentMcpServers &&
      !hasAnyAiSdkTools &&
      enabledServers.length === 0 &&
      resolvedAgentMcp?.mcpServers
    ) {
      console.warn(
        '⚠️ Agent MCP config present but no connected MCP servers with tools. Check server logs for SSE/connection errors. Raw server statuses:',
        servers.map((s) => ({
          name: s.name,
          status: s.status,
          disabled: s.disabled,
          toolCount: s.tools?.length ?? 0,
        })),
      );
    }

    for (const server of enabledServers) {
      if (!server.tools) continue;

      for (const mcpTool of server.tools) {
        const internalName = `${server.name}__${mcpTool.name}`;
        const toolName = sanitizeModelToolName(
          internalName,
          usedModelToolNames,
        );

        // Convert JSON Schema to Zod schema for parameters
        let parametersSchema: z.ZodTypeAny = z.object({});

        if (mcpTool.inputSchema) {
          try {
            parametersSchema = jsonSchemaToZodObject(mcpTool.inputSchema);
          } catch (error) {
            console.warn(
              `Failed to convert JSON schema to Zod for tool ${internalName}:`,
              error,
            );
            parametersSchema = z.object({});
          }
        }

        mcpTools[toolName] = dynamicTool({
          description:
            mcpTool.description ||
            `MCP tool: ${mcpTool.name} from ${server.name}`,
          inputSchema: parametersSchema,
          execute: async (args: any) => {
            console.log(
              `🛠️ Executing MCP tool: ${internalName} (model tool name: ${toolName}) with args:`,
              args,
            );
            try {
              const result = await mcpClient.callTool(
                server.name,
                mcpTool.name,
                args,
              );
              console.log(`✅ MCP tool result for ${internalName}:`, result);
              return result;
            } catch (error) {
              console.error(
                `❌ MCP tool execution failed for ${internalName}:`,
                error,
              );
              throw error;
            }
          },
        });

        mcpActiveTools.push(toolName);
      }
    }

    const customApi = buildAgentCustomApiTools(
      agentToolsConfig,
      sanitizeModelToolName,
      usedModelToolNames,
    );
    Object.assign(mcpTools, customApi.tools);
    mcpActiveTools.push(...customApi.activeNames);

    if (chatId) {
      const computerUse = buildAgentComputerUseTools(
        agentToolsConfig,
        chatId,
        sanitizeModelToolName,
        usedModelToolNames,
      );
      Object.assign(mcpTools, computerUse.tools);
      mcpActiveTools.push(...computerUse.activeNames);
      computerUseRegistered = computerUse.computerUseRegistered;
    }

    // Add knowledge base search tool if agent has knowledge base IDs
    if (agentKnowledgeBaseIds && agentKnowledgeBaseIds.length > 0) {
      console.log('🔧 Adding knowledge base search tool for agent');
      const { searchKnowledgeBaseTool } = await import(
        '@/lib/ai/tools/search-knowledge-base'
      );

      mcpTools.knowledge_base_search = searchKnowledgeBaseTool(
        agentKnowledgeBaseIds,
      );
      mcpActiveTools.push('knowledge_base_search');

      console.log('🔧 Knowledge base search tool added');
    }

    console.log('🔧 All tools ready:', mcpActiveTools);
    return {
      mcpTools,
      mcpActiveTools,
      closeAiSdkMcpClients,
      computerUseRegistered,
    };
  } catch (error) {
    console.error('❌ Failed to initialize tools:', error);
    return {
      mcpTools,
      mcpActiveTools,
      closeAiSdkMcpClients: async () => {},
      computerUseRegistered: false,
    };
  }
}

export async function POST(request: Request) {
  console.log('🚀 POST /api/chat - Starting request processing');
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    const j = json && typeof json === 'object' ? (json as Record<string, unknown>) : null;
    const logSafe = j
      ? {
          ...j,
          ...(j.agentMcpConfig !== undefined
            ? {
                agentMcpConfig: redactMcpConfigForLog(j.agentMcpConfig),
              }
            : {}),
          ...(j.agentTools !== undefined
            ? { agentTools: redactAgentToolsForLog(j.agentTools) }
            : {}),
        }
      : json;
    console.log('🔧 Raw JSON received:', JSON.stringify(logSafe, null, 2));
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    console.error('❌ Request parsing/validation failed:', error);

    // Check if it's a character limit error
    if (error instanceof Error && error.message.includes('too_big')) {
      return new ChatSDKError(
        'bad_request:api',
        'Your message is too long. Please keep it under 100,000 characters.',
      ).toResponse();
    }

    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const {
      id,
      message,
      selectedChatModel,
      selectedVisibilityType,
      agentSystemPrompt,
      agentResponsibilities,
      agentMcpConfig,
      agentKnowledgeBaseIds,
      agentTools,
    } = requestBody;
    console.log('🔧 Request Body received (redacted MCP):', {
      ...requestBody,
      agentMcpConfig: redactMcpConfigForLog(agentMcpConfig),
      agentTools:
        agentTools !== undefined ? redactAgentToolsForLog(agentTools) : undefined,
    });

    console.log('🔧 Agent System Prompt received:', agentSystemPrompt);
    console.log('🔧 Agent Responsibilities received:', agentResponsibilities);
    console.log(
      '🔧 Agent MCP Config received (redacted):',
      redactMcpConfigForLog(agentMcpConfig),
    );
    console.log('🔧 Agent Knowledge Base IDs received:', agentKnowledgeBaseIds);
    console.log(
      '🔧 Agent tools received (redacted):',
      agentTools !== undefined ? redactAgentToolsForLog(agentTools) : undefined,
    );

    const session = await auth();
    if (!session?.user) {
      console.error('❌ No session or user found');
      return new ChatSDKError('unauthorized:chat').toResponse();
    }

    const chat = await getChatById({ id });

    if (!chat) {
      console.log('📝 Creating new chat');
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
        agentSystemPrompt,
        agentResponsibilities,
        agentMcpConfig,
        agentTools,
        agentKnowledgeBaseIds,
      });
      console.log('✅ New chat saved with agent data:', {
        agentSystemPrompt,
        agentResponsibilities,
        hasAgentMcp: !!agentMcpConfig,
        hasAgentTools: !!agentTools,
      });
    } else {
      console.log('📂 Using existing chat');
      if (chat.userId !== session.user.id) {
        console.error('❌ Chat access forbidden');
        return new ChatSDKError('forbidden:chat').toResponse();
      }
      // Persist agent/MCP when the client sends it (reload still works via merge below)
      if (
        agentMcpConfig !== undefined ||
        agentTools !== undefined ||
        agentKnowledgeBaseIds !== undefined ||
        agentSystemPrompt !== undefined ||
        agentResponsibilities !== undefined
      ) {
        await mergeChatAgentFields({
          id,
          ...(agentMcpConfig !== undefined ? { agentMcpConfig } : {}),
          ...(agentTools !== undefined ? { agentTools } : {}),
          ...(agentKnowledgeBaseIds !== undefined
            ? { agentKnowledgeBaseIds }
            : {}),
          ...(agentSystemPrompt !== undefined ? { agentSystemPrompt } : {}),
          ...(agentResponsibilities !== undefined
            ? { agentResponsibilities }
            : {}),
        });
      }
    }

    const effectiveAgentMcpConfig = agentMcpConfig ?? chat?.agentMcpConfig;
    const effectiveAgentKnowledgeBaseIds =
      agentKnowledgeBaseIds ?? chat?.agentKnowledgeBaseIds;
    const effectiveAgentSystemPrompt =
      agentSystemPrompt ?? chat?.agentSystemPrompt;
    const effectiveAgentResponsibilities =
      agentResponsibilities ?? chat?.agentResponsibilities;
    const effectiveAgentTools = agentTools ?? chat?.agentTools;

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];
    /**
     * The OpenAI-compatible provider rejects `file` parts for PDFs and OOXML
     * office formats (pptx/docx/xlsx). Expand those server-side into bounded
     * text parts; stored messages keep the original `file` parts for the UI.
     */
    const uiMessagesForModel = await expandFilePartsForModel(uiMessages);

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: [],
          createdAt: new Date(),
        },
      ],
    });

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    const forceNativeFileSkills = isNativeFileSkillsRequest(
      message.parts as Array<{ type: string; text?: string }>,
    );

    const mcpToolDedupeByInput = new Map<string, unknown>();

    // Get MCP tools + Agent Builder HTTP tools for this user
    const { mcpTools, mcpActiveTools, closeAiSdkMcpClients, computerUseRegistered } =
      await getMcpToolsForAI(
        session.user.id,
        effectiveAgentMcpConfig,
        effectiveAgentKnowledgeBaseIds,
        effectiveAgentTools,
        mcpToolDedupeByInput,
        id,
      );

    const stream = createUIMessageStream({
      execute: async ({ writer: dataStream }) => {
        const hasMcpToolsForRequest = mcpActiveTools.length > 0;

        const resolvedModelId =
          resolveConfiguredLanguageModelId(selectedChatModel);
        const anthropicExtensions = getAnthropicExtensionsForModel(
          resolvedModelId,
          selectedChatModel,
        );
        const anthropicSkillIds =
          anthropicExtensions?.container?.skills.map((skill) => skill.skillId) ?? [];
        const useNativeFileSkillsMode =
          forceNativeFileSkills && !!anthropicExtensions;

        const openaiCompatibleProviderOptions: {
          user?: string;
          reasoningEffort?: 'medium';
          anthropicExtensions?: AnthropicExtensionsConfig;
        } = {};

        if (selectedChatModel === 'chat-model-reasoning') {
          openaiCompatibleProviderOptions.user = session.user.id;
          // High reasoning + tools has caused empty streams on some gateways. We always register
          // built-in tools (createDocument, createMermaidDiagram, etc.); medium keeps tool calls
          // reliable. High effort without MCP was skewing toward prose-only answers after "thinking".
          openaiCompatibleProviderOptions.reasoningEffort = 'medium';
        }

        if (anthropicExtensions) {
          openaiCompatibleProviderOptions.anthropicExtensions = anthropicExtensions;
        }

        const providerOptions =
          Object.keys(openaiCompatibleProviderOptions).length > 0
            ? {
                openaiCompatible: openaiCompatibleProviderOptions,
              }
            : undefined;

        const systemPromptSections = buildSystemPromptSections({
          selectedChatModel,
          requestHints,
          agentSystemPrompt: effectiveAgentSystemPrompt,
          agentResponsibilities: effectiveAgentResponsibilities,
          agentKnowledgeBaseIds: effectiveAgentKnowledgeBaseIds,
          mcpToolNames: mcpActiveTools,
          anthropicSkillsEnabled: !!anthropicExtensions,
          anthropicSkills: anthropicSkillIds,
          forceNativeFileSkills: useNativeFileSkillsMode,
          desktopComputerUseEnabled: computerUseRegistered,
        });

        const systemPromptText = buildEffectiveSystemPrompt({
          overrideSystemPrompt: process.env.SYSTEM_PROMPT_OVERRIDE,
          appendSystemPrompt: process.env.SYSTEM_PROMPT_APPEND,
          build: () => joinSystemPromptSections(systemPromptSections),
        });

        if (process.env.DEBUG_SYSTEM_PROMPT === 'true') {
          console.log(dumpSystemPrompt(systemPromptSections));
          console.log('🔧 System Prompt (resolved):', systemPromptText);
        }

        // Same ToolSet as `streamText` so `convertToModelMessages` can serialize
        // prior turns' tool outputs (especially dynamic MCP tools) for the model/core.
        const toolsForModel: Record<string, any> = {
          getWeather,
          updateAgentTasks,
          renderHostMap,
          ...mcpTools,
        };

        // Always register Anthropic code-execution passthrough tools so the model/gateway never
        // sees "unavailable tool" for these ids (multi-turn + strict activeTools).
        Object.assign(toolsForModel, createAnthropicSkillsPassthroughTools());

        if (!useNativeFileSkillsMode) {
          Object.assign(toolsForModel, {
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
            createIshikawaDiagram: createIshikawaDiagram({ session, dataStream }),
            createMermaidDiagram: createMermaidDiagram({ session, dataStream }),
          });
        }

        if (DEBUG_OPENAI_COMPATIBLE) {
          const latestMessage = uiMessagesForModel.at(-1);
          console.log(
            '🔍 [compatible-api] outgoing request',
            JSON.stringify(
              {
                selectedChatModel,
                providerOptions,
                toolCount: Object.keys(toolsForModel).length,
                latestMessage: latestMessage
                  ? {
                      id: latestMessage.id,
                      role: latestMessage.role,
                      partTypes: latestMessage.parts.map((part) => part.type),
                    }
                  : null,
              },
              null,
              2,
            ),
          );
        }

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPromptText,
          messages: await convertToModelMessages(uiMessagesForModel, {
            tools: toolsForModel,
          }),
          providerOptions,
          experimental_repairToolCall:
            hasMcpToolsForRequest ? createMcpToolCallRepair() : undefined,
          // Keep raw provider chunk boundaries so json-render SpecStream (JSONL patches)
          // can flush progressively without word-level buffering/rechunking.
          // Tool call + optional follow-up text needs more than one step
          stopWhen: stepCountIs(
            computerUseRegistered ? 18 : hasMcpToolsForRequest ? 12 : 5,
          ),
          // Explicit auto whenever tools exist (built-ins are always present); undefined matched some
          // gateways poorly vs MCP-only turns that passed 'auto'.
          toolChoice: 'auto',
          onChunk: ({ chunk }) => {
            if (chunk.type === 'tool-result') {
              const tr = chunk as { toolName?: string; toolCallId?: string; output?: unknown };
              if (toolOutputLooksProblematic(tr.output)) {
                console.warn('⚠️ [chat-tools] stream tool-result looks like failure', {
                  toolName: tr.toolName,
                  toolCallId: tr.toolCallId,
                  outputPreview: truncateForDebugLog(tr.output, 8000),
                });
              }
            }
            if (CHAT_TOOLS_VERBOSE) {
              const t = chunk.type;
              if (
                t === 'tool-call' ||
                t === 'tool-input-start' ||
                t === 'tool-input-delta' ||
                t === 'tool-result' ||
                t === 'raw'
              ) {
                console.log('🔧 [chat-tools] stream chunk', {
                  type: t,
                  preview: truncateForDebugLog(chunk, 16000),
                });
              }
            }
            if (DEBUG_CHAT_STREAM_CHUNKS) {
              if (chunk.type === 'text-delta') {
                const text =
                  'text' in chunk && typeof chunk.text === 'string'
                    ? chunk.text
                    : '';
                console.log('🔍 [chat-stream-chunk]', {
                  type: chunk.type,
                  textPreview: text.slice(0, 160),
                });
              } else if (chunk.type === 'reasoning-delta') {
                const text =
                  'text' in chunk && typeof chunk.text === 'string'
                    ? chunk.text
                    : '';
                console.log('🔍 [chat-stream-chunk]', {
                  type: chunk.type,
                  textPreview: text.slice(0, 160),
                });
              } else {
                console.log('🔍 [chat-stream-chunk]', chunk);
              }
            }
          },
          ...(CHAT_TOOLS_VERBOSE
            ? {
                onError: ({ error }: { error: unknown }) => {
                  console.error('🔧 [chat-tools] streamText error', error);
                },
                experimental_onToolCallStart: ({
                  toolCall,
                  stepNumber,
                }: {
                  toolCall: {
                    toolName: string;
                    toolCallId: string;
                    providerExecuted?: boolean;
                    input?: unknown;
                  };
                  stepNumber: number | undefined;
                }) => {
                  console.log('🔧 [chat-tools] onToolCallStart', {
                    stepNumber,
                    toolName: toolCall.toolName,
                    toolCallId: toolCall.toolCallId,
                    providerExecuted: toolCall.providerExecuted,
                    inputPreview: truncateForDebugLog(
                      'input' in toolCall ? toolCall.input : toolCall,
                      8000,
                    ),
                  });
                },
                experimental_onToolCallFinish: (
                  event:
                    | {
                        success: true;
                        toolCall: { toolName: string; toolCallId: string };
                        durationMs: number;
                        stepNumber: number | undefined;
                        output: unknown;
                      }
                    | {
                        success: false;
                        toolCall: { toolName: string; toolCallId: string };
                        durationMs: number;
                        stepNumber: number | undefined;
                        error: unknown;
                      },
                ) => {
                  const base = {
                    stepNumber: event.stepNumber,
                    toolName: event.toolCall.toolName,
                    toolCallId: event.toolCall.toolCallId,
                    durationMs: event.durationMs,
                  };
                  if (event.success) {
                    console.log('🔧 [chat-tools] onToolCallFinish ok', {
                      ...base,
                      outputPreview: truncateForDebugLog(event.output, 12000),
                    });
                  } else {
                    console.log('🔧 [chat-tools] onToolCallFinish error', {
                      ...base,
                      error: truncateForDebugLog(event.error, 8000),
                    });
                  }
                },
                onStepFinish: (step: {
                  finishReason: string;
                  toolCalls: Array<{ toolName: string; toolCallId: string }>;
                  toolResults: Array<{
                    toolName: string;
                    toolCallId: string;
                    output: unknown;
                  }>;
                }) => {
                  console.log('🔧 [chat-tools] onStepFinish', {
                    finishReason: step.finishReason,
                    toolCalls: step.toolCalls.map((tc) => ({
                      name: tc.toolName,
                      id: tc.toolCallId,
                    })),
                    toolResults: step.toolResults.map((tr) => ({
                      toolName: tr.toolName,
                      toolCallId: tr.toolCallId,
                      outputPreview: truncateForDebugLog(tr.output, 8000),
                    })),
                  });
                },
              }
            : {}),
          onFinish: async (event) => {
            for (const step of event.steps) {
              if (step.finishReason === 'error') {
                console.warn('⚠️ [chat-tools] step finishReason=error', {
                  stepNumber: step.stepNumber,
                  textPreview: step.text?.slice(0, 500),
                });
              }
              for (const tr of step.toolResults) {
                if (toolOutputLooksProblematic(tr.output)) {
                  console.warn(
                    '⚠️ [chat-tools] tool result flagged as failure (provider / gateway)',
                    {
                      stepNumber: step.stepNumber,
                      toolName: tr.toolName,
                      toolCallId: tr.toolCallId,
                      outputPreview: truncateForDebugLog(tr.output, 8000),
                    },
                  );
                }
              }
            }
            await closeAiSdkMcpClients();
          },

          // Same built-in tools for all models so artifacts (createDocument / updateDocument)
          // work when using chat-model-reasoning (default). MCP tools stay appended.
          activeTools: [
            'getWeather',
            ...(useNativeFileSkillsMode
              ? []
              : [
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                  'createIshikawaDiagram',
                  'createMermaidDiagram',
                ]),
            'text_editor_code_execution',
            'bash_code_execution',
            'code_execution',
            'updateAgentTasks',
            'renderHostMap',
            ...mcpActiveTools,
          ] as any,
          tools: toolsForModel,
        });

        // Single consumer: merge() already reads `fullStream` via `toUIMessageStream`.
        // A second `consumeStream()` would tee the model stream again and race the UI merge.
        dataStream.merge(
          pipeJsonRender(
            result.toUIMessageStream({
              sendReasoning: true,
            }),
          ),
        );
      },
      generateId: generateUUID,
      onFinish: async ({ messages }) => {
        if (DEBUG_OPENAI_COMPATIBLE) {
          const assistantMessage = [...messages]
            .reverse()
            .find((message) => message.role === 'assistant');
          const reasoningParts = assistantMessage
            ? assistantMessage.parts.filter((part) => part.type === 'reasoning')
            : [];
          const textParts = assistantMessage
            ? assistantMessage.parts.filter((part) => part.type === 'text')
            : [];

          console.log(
            '🔍 [compatible-api] incoming response summary',
            JSON.stringify(
              {
                assistantMessageId: assistantMessage?.id ?? null,
                assistantPartTypes:
                  assistantMessage?.parts.map((part) => part.type) ?? [],
                reasoningPartsCount: reasoningParts.length,
                reasoningPreview: reasoningParts
                  .map((part) =>
                    'text' in part && typeof part.text === 'string'
                      ? part.text.slice(0, 300)
                      : '',
                  )
                  .filter(Boolean),
                textPreview: textParts
                  .map((part) =>
                    'text' in part && typeof part.text === 'string'
                      ? part.text.slice(0, 300)
                      : '',
                  )
                  .filter(Boolean),
              },
              null,
              2,
            ),
          );
        }

        await saveMessages({
          messages: messages.map((message) => ({
            id: message.id,
            role: message.role,
            parts: message.parts,
            createdAt: new Date(),
            attachments: [],
            chatId: id,
          })),
        });
      },
      onError: () => {
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () =>
          stream.pipeThrough(new JsonToSseTransformStream()),
        ),
      );
    } else {
      return new Response(stream.pipeThrough(new JsonToSseTransformStream()));
    }
  } catch (error) {
    if (error instanceof ChatSDKError) {
      console.error('❌ ChatSDKError caught:', error.message);
      return error.toResponse();
    }
    console.error('❌ Unexpected error in chat route:', error);
    return new ChatSDKError(
      'bad_request:chat',
      'An unexpected error occurred',
    ).toResponse();
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat | null;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = createUIMessageStream<ChatMessage>({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(recentStreamId, () =>
    emptyDataStream.pipeThrough(new JsonToSseTransformStream()),
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createUIMessageStream<ChatMessage>({
      execute: ({ writer }) => {
        writer.write({
          type: 'data-appendMessage',
          data: JSON.stringify(mostRecentMessage),
          transient: true,
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
