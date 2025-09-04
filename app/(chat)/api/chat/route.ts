import {
  smoothStream,
  streamText,
  stepCountIs,
  createUIMessageStream,
  convertToModelMessages,
  JsonToSseTransformStream,
  dynamicTool,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { createMermaidDiagram } from '@/lib/ai/tools/create-mermaid-diagram';
import { myProvider } from '@/lib/ai/providers';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
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
import { convertToUIMessages } from '../../utils';
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

// Helper function to get MCP tools for the AI SDK
async function getMcpToolsForAI(userId: string) {
  const mcpTools: Record<string, any> = {};
  const mcpActiveTools: string[] = [];

  try {
    console.log('🔧 Getting MCP client instance for user:', userId);
    const mcpClient = getMcpClientInstance(userId);

    if (!mcpClient || mcpClient.isConnecting) {
      console.log('⏳ MCP client not ready or still connecting');
      return { mcpTools, mcpActiveTools };
    }

    // Ensure MCP servers are initialized
    if (mcpClient.connections.length === 0) {
      console.log('🔧 No connections found, initializing MCP servers...');
      try {
        await mcpClient.initializeMcpServers();
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

    for (const server of enabledServers) {
      if (!server.tools) continue;

      for (const mcpTool of server.tools) {
        // Create a unique tool name with server prefix
        const toolName = `${server.name}__${mcpTool.name}`;

        // Convert JSON Schema to Zod schema for parameters
        let parametersSchema: z.ZodTypeAny = z.object({});

        if (mcpTool.inputSchema) {
          try {
            parametersSchema = jsonSchemaToZodObject(mcpTool.inputSchema);
          } catch (error) {
            console.warn(
              `Failed to convert JSON schema to Zod for tool ${toolName}:`,
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
            console.log(`🛠️ Executing MCP tool: ${toolName} with args:`, args);
            try {
              const result = await mcpClient.callTool(
                server.name,
                mcpTool.name,
                args,
              );
              console.log(`✅ MCP tool result for ${toolName}:`, result);
              return result;
            } catch (error) {
              console.error(
                `❌ MCP tool execution failed for ${toolName}:`,
                error,
              );
              throw error;
            }
          },
        });

        mcpActiveTools.push(toolName);
      }
    }

    console.log('🔧 MCP tools ready:', mcpActiveTools);
    return { mcpTools, mcpActiveTools };
  } catch (error) {
    console.error('❌ Failed to initialize MCP tools:', error);
    return { mcpTools, mcpActiveTools };
  }
}

export async function POST(request: Request) {
  console.log('🚀 POST /api/chat - Starting request processing');
  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
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
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

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
      });
      console.log('✅ New chat saved');
    } else {
      console.log('📂 Using existing chat');
      if (chat.userId !== session.user.id) {
        console.error('❌ Chat access forbidden');
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const messagesFromDb = await getMessagesByChatId({ id });
    const uiMessages = [...convertToUIMessages(messagesFromDb), message];

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

    // Get MCP tools for this user
    const { mcpTools, mcpActiveTools } = await getMcpToolsForAI(
      session.user.id,
    );

    const stream = createUIMessageStream({
      execute: ({ writer: dataStream }) => {
        const result = streamText({
          model: myProvider.languageModel(selectedChatModel),
          system: systemPrompt({ selectedChatModel, requestHints }),
          messages: convertToModelMessages(uiMessages),
          stopWhen: stepCountIs(5),

          experimental_activeTools:
            selectedChatModel === 'chat-model-reasoning'
              ? []
              : ([
                  'getWeather',
                  'createDocument',
                  'updateDocument',
                  'requestSuggestions',
                  'createMermaidDiagram',
                  ...mcpActiveTools,
                ] as any),
          experimental_transform: smoothStream({ chunking: 'word' }),
          tools: {
            getWeather,
            createDocument: createDocument({ session, dataStream }),
            updateDocument: updateDocument({ session, dataStream }),
            requestSuggestions: requestSuggestions({
              session,
              dataStream,
            }),
            createMermaidDiagram: createMermaidDiagram({ session, dataStream }),
            ...mcpTools,
          },
        });

        result.consumeStream();

        dataStream.merge(
          result.toUIMessageStream({
            sendReasoning: true,
          }),
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
