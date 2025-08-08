"use client";

// React imports
import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";

// Next.js imports
import { useSession } from "next-auth/react";

// MCP imports
import { MCPClient } from "./client";

// Utils
import { guestRegex } from "../constants";

// Types
interface MCPContextType {
  mcpClient: MCPClient | null;
  isInitializing: boolean;
  error: string | null;
  reinitialize: () => Promise<void>;
}

// Context
const MCPContext = createContext<MCPContextType | undefined>(undefined);

// Provider prop types
interface MCPProviderProps {
  children: ReactNode;
}

export function MCPProvider({ children }: MCPProviderProps) {
  const { data: session } = useSession();
  const [mcpClient, setMcpClient] = useState<MCPClient | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isGuest = guestRegex.test(session?.user?.email ?? "");

  const initializeMCPClient = async (userId: string) => {
    try {
      setIsInitializing(true);
      setError(null);

      // Create new MCPClient instance
      const client = new MCPClient(userId);

      setMcpClient(client);
      console.log("MCPClient initialized successfully");
    } catch (err) {
      console.error("Failed to initialize MCPClient:", err);
      setError(
        err instanceof Error ? err.message : "Failed to initialize MCP client"
      );
      setMcpClient(null);
    } finally {
      setIsInitializing(false);
    }
  };

  const reinitialize = async () => {
    if (session?.user?.id) {
      await initializeMCPClient(session.user.id);
    }
  };

  useEffect(() => {
    // Clean up previous client when session changes
    if (mcpClient) {
      // Disconnect existing connections
      mcpClient.disconnectAll();
      setMcpClient(null);
    }

    // Initialize new client if user is authenticated
    if (!isGuest) {
      initializeMCPClient(session?.user?.id ?? "");
    } else if (isGuest) {
      setMcpClient(null);
      setError(null);
      setIsInitializing(false);
    }
  }, [session?.user?.id, isGuest]);

  const contextValue: MCPContextType = {
    mcpClient,
    isInitializing,
    error,
    reinitialize,
  };

  return (
    <MCPContext.Provider value={contextValue}>{children}</MCPContext.Provider>
  );
}

export function useMCPClient(): MCPContextType {
  const context = useContext(MCPContext);
  if (context === undefined) {
    throw new Error("useMCPClient must be used within an MCPProvider");
  }
  return context;
}
