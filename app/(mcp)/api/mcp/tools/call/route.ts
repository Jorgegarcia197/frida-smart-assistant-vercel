import { NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

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
