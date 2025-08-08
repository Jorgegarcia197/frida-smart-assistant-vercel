"use server";

// MCP client
import { MCPClient } from "@/lib/mcp/client";

// Utils
import { guestRegex } from "../constants";

// Global registry to maintain one MCP client instance per user
const mcpClientRegistry = new Map<string, MCPClient>();

/**
 * Checks if the user is a guest based on email
 * @param email - The user's email address
 * @returns true if the user is a guest, false otherwise
 */
const isUserGuest = (email: string | null | undefined): boolean => {
  return guestRegex.test(email ?? "");
};

/**
 * Gets or creates an MCP client instance for a user
 * This ensures we have only one instance per user across the server
 */
export async function getMCPClientForUser(
  userId: string,
  userEmail: string | null | undefined
): Promise<MCPClient | null> {
  if (isUserGuest(userEmail)) {
    return null;
  }

  if (!mcpClientRegistry.has(userId)) {
    console.log(`Creating new MCP client for user: ${userId}`);
    const client = new MCPClient(userId);
    mcpClientRegistry.set(userId, client);
    return client;
  }

  console.log(`Reusing existing MCP client for user: ${userId}`);
  return mcpClientRegistry.get(userId)!;
}

/**
 * Removes an MCP client instance for a user
 * Useful for cleanup when user logs out
 */
export async function removeMCPClientForUser(
  userId: string,
  userEmail: string | null | undefined
): Promise<void> {
  if (isUserGuest(userEmail)) {
    return;
  }

  const client = mcpClientRegistry.get(userId);
  if (client) {
    console.log(`Removing MCP client for user: ${userId}`);
    await client.disconnectAll();
    mcpClientRegistry.delete(userId);
  }
}

/**
 * Gets all active user IDs with MCP clients
 */
export async function getActiveMCPUserIds(
  userEmail: string | null | undefined
): Promise<string[]> {
  if (isUserGuest(userEmail)) {
    return [];
  }
  return Array.from(mcpClientRegistry.keys());
}

/**
 * Cleanup function to disconnect all clients
 * Useful for server shutdown
 */
export async function disconnectAllMCPClients(
  userEmail: string | null | undefined
): Promise<void> {
  if (isUserGuest(userEmail)) {
    return;
  }

  console.log("Disconnecting all MCP clients...");
  const disconnectPromises = Array.from(mcpClientRegistry.values()).map(
    (client) => client.disconnectAll()
  );

  await Promise.all(disconnectPromises);
  mcpClientRegistry.clear();
  console.log("All MCP clients disconnected");
}
