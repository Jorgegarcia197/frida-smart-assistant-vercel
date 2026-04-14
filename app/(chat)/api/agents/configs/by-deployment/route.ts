import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import type { Agent } from '@/hooks/use-agents';
import { normalizeAgentMcps } from '@/lib/agents/normalize-agent-mcps';

type ExternalConfig = {
  id: string;
  name: string;
  short_name?: string;
  avatar?: string;
  conversation_starters?: unknown[];
  greetings?: unknown;
  deployment: string;
  deployment_type?: string;
  system_prompt: string;
  description?: string;
  knowledge_base_ids?: string[];
  model_configuration?: Record<string, unknown>;
  personalization_config?: Record<string, unknown> | null;
  responsibilities?: unknown[];
  risks?: Record<string, string>;
  security?: Record<string, unknown>;
  mcps: unknown;
  tools?: Record<string, unknown>;
  uploaded_documents?: unknown[];
  tags?: unknown[];
  is_public?: boolean;
  created_at?: string;
  created_by?: string;
  updated_at?: string;
};

function mapGreetings(raw: unknown): Agent['greetings'] {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const first = raw[0];
  if (typeof first === 'string') {
    return (raw as string[]).map((text) => ({ text }));
  }
  return raw as Agent['greetings'];
}

type ExternalResponse = {
  success: boolean;
  message?: string;
  data?: ExternalConfig[];
  count?: number;
  error?: string | null;
};

function mapConfigToAgent(config: ExternalConfig): Agent {
  const prompt = config.system_prompt ?? '';
  const descriptionFromPrompt =
    prompt.length > 240 ? `${prompt.slice(0, 237)}...` : prompt;

  return {
    id: config.id,
    name: config.name,
    shortName: config.short_name ?? config.name,
    description: config.description ?? descriptionFromPrompt,
    avatar: config.avatar ?? '',
    createdBy: config.created_by ?? '',
    isPublic: config.is_public ?? true,
    deployment: config.deployment,
    deployment_type: config.deployment_type ?? config.deployment,
    createdAt: config.created_at ?? '',
    updatedAt: config.updated_at ?? '',
    systemPrompt: config.system_prompt,
    knowledgeBaseIds: config.knowledge_base_ids ?? [],
    uploadedDocuments: config.uploaded_documents,
    modelConfig: config.model_configuration,
    greetings: mapGreetings(config.greetings),
    conversationStarters: config.conversation_starters,
    responsibilities: config.responsibilities,
    risks: config.risks,
    tags: config.tags,
    mcps: normalizeAgentMcps(config.mcps),
    tools: config.tools,
    personalization: config.personalization_config ?? undefined,
  };
}

export async function GET(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'User email not found in session' },
        { status: 401 },
      );
    }

    const baseUrl = process.env.FRIDA_AGENT_BUILDER_BASE_URL?.replace(
      /\/$/,
      '',
    );
    const apiKey = process.env.FRIDA_AGENT_BUILDER_API_KEY;

    if (!baseUrl || !apiKey) {
      return NextResponse.json(
        { error: 'Agent builder API is not configured' },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const deployment =
      searchParams.get('deployment')?.trim() || 'frida-assistant';

    const url = `${baseUrl}/agents/api/v1/agents/configs/by-deployment/${encodeURIComponent(deployment)}`;

    const agentsResponse = await fetch(url, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
      },
      cache: 'no-store',
    });

    if (!agentsResponse.ok) {
      const text = await agentsResponse.text();
      console.error(
        'Agent builder API error:',
        agentsResponse.status,
        text,
      );
      return NextResponse.json(
        { error: 'Failed to fetch agent configurations from agent builder' },
        { status: agentsResponse.status },
      );
    }

    const body = (await agentsResponse.json()) as ExternalResponse;

    if (!body.success || !Array.isArray(body.data)) {
      return NextResponse.json(
        {
          success: false,
          agents: [],
          error:
            body.error ||
            body.message ||
            'Invalid response from agent builder',
        },
        { status: 502 },
      );
    }

    const agents = body.data.map(mapConfigToAgent);

    console.log(
      '[agents/by-deployment] Loaded OK',
      JSON.stringify({
        deployment,
        count: agents.length,
        agents: agents.map((a) => ({
          id: a.id,
          name: a.name,
          toolKeys: a.tools && typeof a.tools === 'object'
            ? Object.keys(a.tools as object).length
            : 0,
          mcpServerKeys:
            a.mcps &&
            typeof a.mcps === 'object' &&
            'mcpServers' in (a.mcps as object) &&
            (a.mcps as { mcpServers?: object }).mcpServers
              ? Object.keys(
                  (a.mcps as { mcpServers: object }).mcpServers,
                ).length
              : 0,
        })),
      }),
    );

    return NextResponse.json({
      success: true,
      agents,
      count: body.count ?? agents.length,
      message: body.message,
    });
  } catch (error) {
    console.error('Error fetching agents by deployment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch agent configurations' },
      { status: 500 },
    );
  }
}
