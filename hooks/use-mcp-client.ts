import { useState, useCallback } from "react";
import { McpServer } from "@/lib/mcp/types";
import { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

interface UseMcpClientReturn {
  servers: McpServer[];
  loading: boolean;
  error: string | null;
  // Server management
  getServers: () => Promise<void>;
  addRemoteServer: (serverName: string, serverUrl: string) => Promise<void>;
  toggleServerDisabled: (
    serverName: string,
    disabled: boolean
  ) => Promise<void>;
  restartServer: (serverName: string) => Promise<void>;
  deleteServer: (serverName: string) => Promise<void>;
  // Tool operations
  callTool: (
    serverName: string,
    toolName: string,
    toolArguments?: Record<string, unknown>
  ) => Promise<CallToolResult>;
}

export function useMcpClient(userId: string): UseMcpClientReturn {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const makeRequest = useCallback(
    async (url: string, options: RequestInit = {}) => {
      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      return response.json();
    },
    [userId]
  );

  const getServers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await makeRequest("/api/mcp/servers");
      setServers(data.servers);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to get servers";
      setError(errorMessage);
      console.error("Error getting servers:", err);
    } finally {
      setLoading(false);
    }
  }, [makeRequest]);

  const addRemoteServer = useCallback(
    async (serverName: string, serverUrl: string) => {
      setLoading(true);
      setError(null);
      try {
        await makeRequest("/api/mcp/servers/add", {
          method: "POST",
          body: JSON.stringify({ serverName, serverUrl }),
        });
        // Refresh servers list
        await getServers();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to add server";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [makeRequest, getServers]
  );

  const toggleServerDisabled = useCallback(
    async (serverName: string, disabled: boolean) => {
      setLoading(true);
      setError(null);
      try {
        await makeRequest("/api/mcp/servers/toggle", {
          method: "POST",
          body: JSON.stringify({ serverName, disabled }),
        });
        // Refresh servers list
        await getServers();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to toggle server";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [makeRequest, getServers]
  );

  const restartServer = useCallback(
    async (serverName: string) => {
      setLoading(true);
      setError(null);
      try {
        await makeRequest("/api/mcp/servers/restart", {
          method: "POST",
          body: JSON.stringify({ serverName }),
        });
        // Refresh servers list
        await getServers();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to restart server";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [makeRequest, getServers]
  );

  const deleteServer = useCallback(
    async (serverName: string) => {
      setLoading(true);
      setError(null);
      try {
        await makeRequest("/api/mcp/servers/delete", {
          method: "DELETE",
          body: JSON.stringify({ serverName }),
        });
        // Refresh servers list
        await getServers();
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to delete server";
        setError(errorMessage);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    [makeRequest, getServers]
  );

  const callTool = useCallback(
    async (
      serverName: string,
      toolName: string,
      toolArguments?: Record<string, unknown>
    ): Promise<CallToolResult> => {
      setError(null);
      try {
        const data = await makeRequest("/api/mcp/tools/call", {
          method: "POST",
          body: JSON.stringify({ serverName, toolName, toolArguments }),
        });
        return data.result;
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Failed to call tool";
        setError(errorMessage);
        throw err;
      }
    },
    [makeRequest]
  );

  return {
    servers,
    loading,
    error,
    getServers,
    addRemoteServer,
    toggleServerDisabled,
    restartServer,
    deleteServer,
    callTool,
  };
}
