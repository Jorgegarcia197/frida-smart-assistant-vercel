import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';
import { requireSessionUserId } from '@/lib/mcp/require-session-user-id';

export async function POST(_request: NextRequest) {
  try {
    const authz = await requireSessionUserId();
    if (!authz.ok) return authz.response;
    const { userId } = authz;

    const mcpClient = getMcpClientInstance(userId);
    await mcpClient.addStdioServer();
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding stdio server:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to add server' }, 
      { status: 500 }
    );
  }
}
