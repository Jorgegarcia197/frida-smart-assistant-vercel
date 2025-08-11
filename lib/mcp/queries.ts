"use server";

// Firebase imports
import { db } from "@/lib/firebase";

// Types
import { McpServerFirebaseConfig } from "./types";

/**
 * Fetch MCP servers configuration for a specific user
 * Path: users/{userId}/mcps (single document)
 */
export async function getMcpServers(userId: string): Promise<McpServerFirebaseConfig> {
  try {
    const docRef = db
      .collection("users")
      .doc(userId)
      .collection("mcps")
      .doc("config");
    const doc = await docRef.get();

    if (doc.exists) {
      const data = doc.data() as McpServerFirebaseConfig;
      return data || { mcpServers: {} };
    } else {
      // Document doesn't exist, create it with empty configuration
      const emptyConfig = { mcpServers: {} };
      await docRef.set(emptyConfig);
      return emptyConfig;
    }
  } catch (error) {
    console.error("Error fetching MCP servers from Firebase:", error);
    // Return empty config on error but don't create document
    return { mcpServers: {} };
  }
}

/**
 * Save MCP servers configuration for a specific user
 * Path: users/{userId}/mcps (single document)
 */
export async function saveMcpServers(
  userId: string,
  servers: McpServerFirebaseConfig
): Promise<void> {
  try {
    const docRef = db
      .collection("users")
      .doc(userId)
      .collection("mcps")
      .doc("config");

    await docRef.set(servers);
    console.log("MCP servers saved successfully for user:", userId);
  } catch (error) {
    console.error("Error saving MCP servers to Firebase:", error);
    throw error;
  }
}

/**
 * Add or update a single MCP server in the configuration
 */
// export async function addMcpServer(
//   userId: string,
//   server: McpServer
// ): Promise<void> {
//   const currentServers = await getMcpServers(userId);

//   // Check if server already exists and update, or add new
//   const existingIndex = currentServers.findIndex((s) => s.name === server.name);

//   if (existingIndex >= 0) {
//     currentServers[existingIndex] = server;
//   } else {
//     currentServers.push(server);
//   }

//   await saveMcpServers(userId, currentServers);
// }

/**
 * Remove a specific MCP server from the configuration
 */
// export async function removeMcpServer(
//   userId: string,
//   serverName: string
// ): Promise<void> {
//   const currentServers = await getMcpServers(userId);
//   const filteredServers = currentServers.filter(
//     (server) => server.name !== serverName
//   );

//   await saveMcpServers(userId, filteredServers);
// }
