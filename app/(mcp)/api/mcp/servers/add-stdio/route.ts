import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

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
