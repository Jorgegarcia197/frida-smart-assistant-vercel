import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { requireSessionUserId } from '@/lib/mcp/require-session-user-id';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireSessionUserId();
    if (!authz.ok) return authz.response;
    const { userId } = authz;

    const { serverName, serverUrl } = await request.json();
    
    if (!serverName || !serverUrl) {
      return NextResponse.json(
        { error: 'Server name and URL are required' }, 
        { status: 400 }
      );
    }

    const mcpClient = getMcpClientInstance(userId);
    await mcpClient.addRemoteServer(serverName, serverUrl);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding sse server:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add server' }, 
      { status: 500 }
    );
  }
}
