import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { requireSessionUserId } from '@/lib/mcp/require-session-user-id';

export async function GET(_request: NextRequest) {
  try {
    const authz = await requireSessionUserId();
    if (!authz.ok) return authz.response;
    const { userId } = authz;

    console.log(`[MCP API] Getting servers for user: ${userId}`);
    const mcpClient = getMcpClientInstance(userId);

    // Ensure the client is initialized if it hasn't been already
    if (mcpClient.connections.length === 0) {
      console.log(
        `[MCP API] No connections found, initializing MCP servers...`,
      );
      await mcpClient.initializeMcpServers();
    }

    const servers = mcpClient.getServers();

    console.log(
      `[MCP API] Found ${servers.length} servers:`,
      servers.map((s) => ({
        name: s.name,
        status: s.status,
        disabled: s.disabled,
        toolsCount: s.tools?.length || 0,
      })),
    );

    return NextResponse.json({ servers });
  } catch (error) {
    console.error('Error getting servers:', error);
    return NextResponse.json(
      { error: 'Failed to get servers' },
      { status: 500 },
    );
  }
}
