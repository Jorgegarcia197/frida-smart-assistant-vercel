// MCP client
import { MCPClient } from "@/lib/mcp/client";

// Global singleton instance
let mcpClientInstance: MCPClient | null = null;

/**
 * Get or create the singleton MCP client instance
 */
export function getMcpClientInstance(userId: string): MCPClient {
  if (!mcpClientInstance || mcpClientInstance.userId !== userId) {
    // If no instance exists or user changed, create new instance
    if (mcpClientInstance) {
      // Cleanup previous instance
      mcpClientInstance.disconnectAll().catch(console.error);
    }
    mcpClientInstance = new MCPClient(userId);
  }

  return mcpClientInstance;
}

/**
 * Cleanup the singleton instance
 */
export async function cleanupMcpClient(): Promise<void> {
  if (mcpClientInstance) {
    await mcpClientInstance.disconnectAll();
    mcpClientInstance = null;
  }
}
