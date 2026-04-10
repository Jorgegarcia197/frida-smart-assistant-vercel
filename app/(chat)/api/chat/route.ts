import {
  streamText,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  JsonToSseTransformStream,
  dynamicTool,
  smoothStream,
} from 'ai';
import { pipeJsonRender } from '@json-render/core';
import { auth } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
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
import { createMermaidDiagram } from '@/lib/ai/tools/create-mermaid-diagram';
import { expandPdfFilePartsForModel } from '@/lib/ai/expand-pdf-parts-for-model';
import { myProvider } from '@/lib/ai/providers';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { normalizeAgentMcps } from '@/lib/agents/normalize-agent-mcps';
import {
  applyServerMcpSecretsFromEnv,
  redactMcpConfigForLog,
} from '@/lib/mcp/merge-server-mcp-env';
import {
  collectAiSdkSseMcpTools,
  filterToNonSseMcpServers,
} from '@/lib/mcp/ai-sdk-mcp-tools';
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

/** AWS Bedrock Converse tool names: [a-zA-Z0-9_-]+, max 64, should start with a letter. */
function sanitizeBedrockToolName(raw: string, used: Set<string>): string {
  let s = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
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
): Promise<{
  mcpTools: Record<string, any>;
  mcpActiveTools: string[];
  closeAiSdkMcpClients: () => Promise<void>;
}> {
  const mcpTools: Record<string, any> = {};
  const mcpActiveTools: string[] = [];
  const bedrockToolNames = new Set<string>();
  let closeAiSdkMcpClients: () => Promise<void> = async () => {};

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

    const mcpServersResolved = resolvedAgentMcp?.mcpServers as
      | Record<string, unknown>
      | undefined;

    // SSE servers: @ai-sdk/mcp createMCPClient (https://ai-sdk.dev/docs/ai-sdk-core/mcp-tools)
    const aiSdkResult = await collectAiSdkSseMcpTools(
      mcpServersResolved,
      sanitizeBedrockToolName,
      bedrockToolNames,
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
      ? { mcpServers: filterToNonSseMcpServers(mcpServersResolved) }
      : undefined;

    // Initialize or merge when there are no connections yet, or when the loaded agent
    // defines MCP servers (must merge even if the user already had hub connections).
    // Agent SSE entries are handled above via @ai-sdk/mcp; only stdio/non-SSE merge here.
    if (mcpClient.connections.length === 0 || hasAgentMcpServers) {
      console.log(
        '🔧 Initializing legacy MCP client (stdio / hub, non-SSE agent entries):',
        hasAgentMcpServers
          ? 'merging non-SSE agent mcpServers with user config'
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
        const toolName = sanitizeBedrockToolName(
          internalName,
          bedrockToolNames,
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
              `🛠️ Executing MCP tool: ${internalName} (Bedrock name: ${toolName}) with args:`,
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
    return { mcpTools, mcpActiveTools, closeAiSdkMcpClients };
  } catch (error) {
    console.error('❌ Failed to initialize tools:', error);
    return {
      mcpTools,
      mcpActiveTools,
      closeAiSdkMcpClients: async () => {},
    };
  }
}

export async function POST(request: Request) {
  console.log('🚀 POST /api/chat - Starting request processing');
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    const logSafe =
      json &&
      typeof json === 'object' &&
      'agentMcpConfig' in json &&
      (json as { agentMcpConfig?: unknown }).agentMcpConfig !== undefined
        ? {
            ...json,
            agentMcpConfig: redactMcpConfigForLog(
              (json as { agentMcpConfig: unknown }).agentMcpConfig,
            ),
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
    } = requestBody;
    console.log('🔧 Request Body received (redacted MCP):', {
      ...requestBody,
      agentMcpConfig: redactMcpConfigForLog(agentMcpConfig),
    });

    console.log('🔧 Agent System Prompt received:', agentSystemPrompt);
    console.log('🔧 Agent Responsibilities received:', agentResponsibilities);
    console.log(
      '🔧 Agent MCP Config received (redacted):',
      redactMcpConfigForLog(agentMcpConfig),
    );
    console.log('🔧 Agent Knowledge Base IDs received:', agentKnowledgeBaseIds);

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
        agentKnowledgeBaseIds,
      });
      console.log('✅ New chat saved with agent data:', {
        agentSystemPrompt,
        agentResponsibilities,
        hasAgentMcp: !!agentMcpConfig,
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
        agentKnowledgeBaseIds !== undefined ||
        agentSystemPrompt !== undefined ||
        agentResponsibilities !== undefined
      ) {
        await mergeChatAgentFields({
          id,
          ...(agentMcpConfig !== undefined ? { agentMcpConfig } : {}),
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

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];
    /** PDF `file` parts are unsupported by the OpenAI-compatible provider; expand to text. */
    const uiMessagesForModel = await expandPdfFilePartsForModel(uiMessages);

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

    // Get MCP tools for this user (with agent MCP config and knowledge base IDs if provided)
    const { mcpTools, mcpActiveTools, closeAiSdkMcpClients } =
      await getMcpToolsForAI(
        session.user.id,
        effectiveAgentMcpConfig,
        effectiveAgentKnowledgeBaseIds,
      );

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const systemPromptText = systemPrompt({
          selectedChatModel,
          requestHints,
          agentSystemPrompt: effectiveAgentSystemPrompt,
          agentResponsibilities: effectiveAgentResponsibilities,
          agentKnowledgeBaseIds: effectiveAgentKnowledgeBaseIds,
          mcpToolNames: mcpActiveTools,
        });

        console.log('🔧 System Prompt:', systemPromptText);

        const hasMcpToolsForRequest = mcpActiveTools.length > 0;

        // Same ToolSet as `streamText` so `convertToModelMessages` can serialize
        // prior turns' tool outputs (especially dynamic MCP tools) for Bedrock/core.
        const toolsForModel = {
          getWeather,
          createDocument: createDocument({ session, dataStream }),
          updateDocument: updateDocument({ session, dataStream }),
          requestSuggestions: requestSuggestions({
            session,
            dataStream,
          }),
          createMermaidDiagram: createMermaidDiagram({ session, dataStream }),
          ...mcpTools,
        };

        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPromptText,
          messages: convertToModelMessages(uiMessagesForModel, {
            tools: toolsForModel,
          }),
          // Word-level smoothing (matches text artifacts). pipeJsonRender buffers JSONL
          // lines until a newline, so inline generative-ui patches stay valid.
          experimental_transform: smoothStream({ chunking: 'word' }),
          // Tool call + optional follow-up text needs more than one step
          stopWhen: stepCountIs(hasMcpToolsForRequest ? 12 : 5),
          toolChoice: hasMcpToolsForRequest ? 'auto' : undefined,
          onFinish: async () => {
            await closeAiSdkMcpClients();
          },

          // Reasoning model disables built-in chat/artifact tools, but agent MCP tools
          // must stay active so loaded agents can use DB/external MCP servers.
          activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? ([...mcpActiveTools] as any)
              : ([
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                  'createMermaidDiagram',
                  ...mcpActiveTools,
                ] as any),
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
