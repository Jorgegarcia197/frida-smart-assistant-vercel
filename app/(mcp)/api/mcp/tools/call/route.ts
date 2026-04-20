import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { requireSessionUserId } from '@/lib/mcp/require-session-user-id';

export async function POST(request: NextRequest) {
  try {
    const authz = await requireSessionUserId();
    if (!authz.ok) return authz.response;
    const { userId } = authz;

    const { serverName, toolName, toolArguments } = await request.json();
    
    if (!serverName || !toolName) {
      return NextResponse.json(
        { error: 'Server name and tool name are required' }, 
        { status: 400 }
      );
    }

    const mcpClient = getMcpClientInstance(userId);
    const result = await mcpClient.callTool(serverName, toolName, toolArguments);
    
    return NextResponse.json({ result });
  } catch (error) {
    console.error('Error calling tool:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to call tool' }, 
      { status: 500 }
    );
  }
}
