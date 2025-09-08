import { type NextRequest, NextResponse } from 'next/server';
import { getMcpClientInstance } from '@/lib/mcp/mcp-singleton-instance';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { serverName, disabled } = await request.json();
    
    if (!serverName || typeof disabled !== 'boolean') {
      return NextResponse.json(
        { error: 'Server name and disabled state are required' }, 
        { status: 400 }
      );
    }

    const mcpClient = getMcpClientInstance(userId);
    await mcpClient.toggleServerDisabledMCP(serverName, disabled);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error toggling server:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to toggle server' }, 
      { status: 500 }
    );
  }
}
