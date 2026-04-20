import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { requireSessionUserId } from '@/lib/mcp/require-session-user-id';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireSessionUserId();
    if (!authz.ok) return authz.response;
    const { userId } = authz;

    const { serverName } = await request.json();
    
    if (!serverName) {
      return NextResponse.json(
        { error: 'Server name is required' }, 
        { status: 400 }
      );
    }

    const mcpClient = getMcpClientInstance(userId);
    await mcpClient.restartConnection(serverName);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error restarting server:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to restart server' }, 
      { status: 500 }
    );
  }
}
