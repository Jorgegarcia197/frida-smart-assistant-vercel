import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { auth } from '@/app/(auth)/auth';
import type { Agent } from '@/hooks/use-agents';
import { normalizeAgentMcps } from '@/lib/agents/normalize-agent-mcps';

type ExternalConfig = {
  id: string;
  name: string;
  deployment: string;
  system_prompt: string;
  knowledge_base_ids: string[];
  personalization_config: Record<string, unknown> | null;
  mcps: unknown;
};

type ExternalResponse = {
  success: boolean;
  message?: string;
  data?: ExternalConfig[];
  count?: number;
  error?: string | null;
};

function mapConfigToAgent(config: ExternalConfig): Agent {
  const prompt = config.system_prompt ?? '';
  return {
    id: config.id,
    name: config.name,
    shortName: config.name,
    description:
      prompt.length > 240 ? `${prompt.slice(0, 237)}...` : prompt,
    avatar: '',
    createdBy: '',
    isPublic: true,
    deployment: config.deployment,
    deployment_type: config.deployment,
    createdAt: '',
    updatedAt: '',
    systemPrompt: config.system_prompt,
    knowledgeBaseIds: config.knowledge_base_ids ?? [],
    mcps: normalizeAgentMcps(config.mcps),
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
