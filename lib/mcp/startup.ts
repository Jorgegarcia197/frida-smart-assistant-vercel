import { getMcpClientInstance, cleanupMcpClient } from "./mcp-singleton-instance";

/**
 * Initialize MCP client for a user on server startup
 * Call this in your app initialization or when user logs in
 */
export async function initializeMcpForUser(userId: string): Promise<void> {
  try {
    const mcpClient = getMcpClientInstance(userId);
    await mcpClient.initializeMcpServers();
    console.log(`MCP client initialized for user: ${userId}`);
  } catch (error) {
    console.error(`Failed to initialize MCP client for user ${userId}:`, error);
  }
}

/**
 * Cleanup MCP connections (call on app shutdown or user logout)
 */
export async function cleanupMcpForUser(): Promise<void> {
  try {
    await cleanupMcpClient();
    console.log("MCP client cleaned up");
  } catch (error) {
    console.error("Failed to cleanup MCP client:", error);
  }
}

// Auto-cleanup on process termination
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, cleaning up MCP connections...");
  await cleanupMcpForUser();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, cleaning up MCP connections...");
  await cleanupMcpForUser();
  process.exit(0);
});
