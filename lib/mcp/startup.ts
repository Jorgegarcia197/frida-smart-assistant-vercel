import { getMcpClientInstance, cleanupMcpClient } from "./mcp-singleton-instance";

/**
 * Initialize MCP client for a user on server startup
 * Call this in your app initialization or when user logs in
 */
export async function initializeMcpForUser(userId: string, retryCount = 0): Promise<void> {
  const maxRetries = 3;
  const retryDelay = 1000 * (retryCount + 1); // Progressive delay: 1s, 2s, 3s
  
  try {
    console.log(`Initializing MCP client for user: ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
    const mcpClient = getMcpClientInstance(userId);
    await mcpClient.initializeMcpServers();
    console.log(`MCP client initialized successfully for user: ${userId}`);
  } catch (error) {
    console.error(`Failed to initialize MCP client for user ${userId} (attempt ${retryCount + 1}):`, error);
    
    if (retryCount < maxRetries) {
      console.log(`Retrying MCP initialization for user ${userId} in ${retryDelay}ms...`);
      setTimeout(() => {
        initializeMcpForUser(userId, retryCount + 1).catch(finalError => {
          console.error(`Final MCP initialization failure for user ${userId}:`, finalError);
        });
      }, retryDelay);
    } else {
      console.error(`MCP initialization failed permanently for user ${userId} after ${maxRetries + 1} attempts`);
    }
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
