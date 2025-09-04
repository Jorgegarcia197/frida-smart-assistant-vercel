import { NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id'); // or get from auth
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

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
