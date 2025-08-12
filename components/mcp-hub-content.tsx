// Components
import { useSession } from "next-auth/react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { toast } from "sonner";

// React imports
import { useEffect, useState } from "react";

// Editor
import Editor from "@monaco-editor/react";

// Next.js imports
import Link from "next/link";
import { useTheme } from "next-themes";

// Icons
import {
  Server,
  X,
  Lock,
  UserPlus,
  LogIn,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Settings,
  RotateCcw,
  Trash2,
  Boxes,
  Plus,
} from "lucide-react";

// Utils
import { guestRegex } from "@/lib/constants";

// Hooks
import { useMcpClient } from "@/hooks/use-mcp-client";

// Server queries (only for config dialog)
import { getMcpServers, saveMcpServers } from "@/lib/mcp/queries";

type MCPHubContentProps = {
  setIsMCPHubOpen: (isOpen: boolean) => void;
};

const MCPHubContent = ({ setIsMCPHubOpen }: MCPHubContentProps) => {
  const { data } = useSession();
  const { theme } = useTheme();
  const isGuest = guestRegex.test(data?.user?.email ?? "");
  
  // MCP Client Hook
  const {
    servers: mcpServers,
    loading: isLoading,
    error: mcpError,
    getServers,
    addRemoteServer,
    toggleServerDisabled,
    restartServer: restartServerHook,
    deleteServer,
    addStdioServer
  } = useMcpClient(data?.user?.id ?? "");

  // State for form inputs
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [expandedServers, setExpandedServers] = useState<
    Record<string, boolean>
  >({});
  const [restartingServers, setRestartingServers] = useState<
    Record<string, boolean>
  >({});
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [editableConfig, setEditableConfig] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [jsonError, setJsonError] = useState("");

  // Local loading states for individual operations
  const [isAddingServer, setIsAddingServer] = useState(false);
  const [togglingServers, setTogglingServers] = useState<Record<string, boolean>>({});
  const [deletingServers, setDeletingServers] = useState<Record<string, boolean>>({});

  const toggleServer = async (serverName: string, disabled: boolean) => {
    const action = !disabled ? "disabled" : "enabled";
    toast.info(`MCP server "${serverName}" is being ${action}`);
    
    setTogglingServers(prev => ({ ...prev, [serverName]: true }));
    
    try {
      await toggleServerDisabled(serverName, !disabled);
      toast.success(`MCP server "${serverName}" was successfully ${action}`);
    } catch (error: any) {
      console.error("Error toggling server:", error);
      toast.error("Error toggling server: " + error.message);
    } finally {
      setTogglingServers(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const toggleExpanded = (serverName: string) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverName]: !prev[serverName],
    }));
  };

  const addServer = async () => {
    if (!serverName || !serverUrl) return;
    
    toast.info(`Adding MCP server "${serverName}". This may take a few seconds...`);
    setIsAddingServer(true);
    
    try {
      await addRemoteServer(serverName, serverUrl);
      setServerName("");
      setServerUrl("");
      toast.success("MCP server added successfully");
    } catch (error: any) {
      console.error("Error adding remote MCP server:", error);
      toast.error("Error adding remote MCP server: " + error.message);
    } finally {
      setIsAddingServer(false);
    }

    await getServers();
  };

  const restartServer = async (serverName: string) => {
    // Start rotation animation
    setRestartingServers((prev) => ({ ...prev, [serverName]: true }));

    try {
      await restartServerHook(serverName);
      toast.success(`Server "${serverName}" restarted successfully`);
    } catch (error: any) {
      console.error(`Error restarting server ${serverName}:`, error);
      toast.error(
        `Error restarting server "${serverName}": ${
          error.message || "Unknown error"
        }`
      );
    } finally {
      // Stop rotation after operation completes
      setTimeout(() => {
        setRestartingServers((prev) => ({ ...prev, [serverName]: false }));
      }, 1000);
    }
  };

  const deleteServerHandler = async (serverName: string) => {
    toast.info(`Deleting MCP server "${serverName}". This may take a few seconds...`);
    setDeletingServers(prev => ({ ...prev, [serverName]: true }));
    
    try {
      await deleteServer(serverName);
      toast.success(`MCP server "${serverName}" was successfully deleted`);
    } catch (error: any) {
      console.error("Error deleting server:", error);
      toast.error("Error deleting server: " + error.message);
    } finally {
      setDeletingServers(prev => ({ ...prev, [serverName]: false }));
    }
  };

  const saveConfigChanges = async () => {
    toast.info("Saving MCP server list. This may take a few seconds...");
    setIsSaving(true);
    setJsonError("");

    try {
      // Validate JSON format
      const parsedConfig = JSON.parse(editableConfig);

      if (!parsedConfig.mcpServers) {
        setJsonError("Configuration must include 'mcpServers' property");
        return;
      }

      // Save the config to Firebase
      await saveMcpServers(data?.user?.id ?? "", parsedConfig);

      // Call the addStdioServer hook to add the stdio server and actually connect to it
      await addStdioServer();

      // Show success toast
      toast.success("MCP server list updated successfully");

      // Close dialog on successful save
      setIsConfigDialogOpen(false);
      await getServers(); // Refresh servers list
    } catch (error) {
      toast.error("Error saving MCP server list. Please try again.");
      if (error instanceof SyntaxError) {
        setJsonError("Invalid JSON format. Please check your syntax.");
      } else {
        setJsonError("Error saving configuration. Please try again.");
        console.error("Error saving config:", error);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const openConfigDialog = async () => {
    const mcpServersConfig = await getFirebaseConfigMcpServers();
    setEditableConfig(JSON.stringify(mcpServersConfig, null, 2));
    setJsonError(""); // Clear any previous errors
    setIsConfigDialogOpen(true);
  };

  /**
   * Get the MCP servers config from Firebase and set the state
   */
  const getFirebaseConfigMcpServers = async () => {
    console.log("Getting MCP servers from Firebase");
    const mcpServersConfig = await getMcpServers(data?.user?.id ?? "");
    return mcpServersConfig;
  };

  // Helper function to render tool parameters
  const renderToolParameters = (inputSchema: any) => {
    if (!inputSchema || !inputSchema.properties) {
      return <p className="text-muted-foreground text-xs">No parameters</p>;
    }

    const { properties, required = [] } = inputSchema;

    return (
      <div className="space-y-2">
        <div className="font-medium text-xs text-muted-foreground uppercase">
          Parameters ({Object.keys(properties).length})
        </div>
        <div className="space-y-2">
          {Object.entries(properties).map(
            ([paramName, paramInfo]: [string, any]) => (
              <div key={paramName} className="bg-muted/50 rounded p-2 text-xs">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{paramName}</span>
                  {required.includes(paramName) ? (
                    <span className="bg-red-100 text-red-800 px-1.5 py-0.5 rounded text-[10px] font-medium">
                      Required
                    </span>
                  ) : (
                    <span className="bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded text-[10px] font-medium">
                      Optional
                    </span>
                  )}
                  <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded text-[10px] font-medium">
                    {paramInfo.type || "any"}
                  </span>
                </div>
                {paramInfo.description && (
                  <p className="text-muted-foreground text-[11px] leading-tight">
                    {paramInfo.description}
                  </p>
                )}
              </div>
            )
          )}
        </div>
      </div>
    );
  };

  // ------------------------------------------------------------ Effects ------------------------------------------------------------

  useEffect(() => {
    if (data?.user?.id && !isGuest) {
      getServers();
    }
  }, [data?.user?.id, isGuest, getServers]);

  // Refresh servers when coming back from background (e.g., after navigation)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && data?.user?.id && !isGuest && !isLoading) {
        getServers();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [data?.user?.id, isGuest, isLoading, getServers]);

  // Show error toast when MCP error occurs
  useEffect(() => {
    if (mcpError) {
      toast.error(`MCP Error: ${mcpError}`);
    }
  }, [mcpError]);

  // ------------------------------------------------------------ Render UI ------------------------------------------------------------

  if (isLoading && mcpServers.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex gap-2 items-center">
            <Server className="size-4" />
            <h2 className="text-lg font-semibold leading-none tracking-tight">
              MCP Hub
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => {
              e.preventDefault();
              setIsMCPHubOpen(false);
            }}
            className="size-8"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="flex-1 p-4 flex items-center justify-center">
          <div className="text-center space-y-2">
            <RefreshCw className="size-8 mx-auto animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Loading MCP servers...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex gap-2 items-center">
          <Server className="size-4" />
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            MCP Hub
          </h2>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            setIsMCPHubOpen(false);
          }}
          className="size-8"
        >
          <X className="size-4" />
        </Button>
      </div>
      <div className="flex-1 p-4 overflow-y-auto">
        {isGuest ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            {/* Lock Icon */}
            <div className="relative">
              <div className="rounded-full bg-muted p-6">
                <Lock className="size-12 text-muted-foreground" />
              </div>
            </div>

            {/* Title and Description */}
            <div className="space-y-2 max-w-sm">
              <h3 className="text-lg font-semibold">Authentication Required</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                To manage and configure MCP servers, you&apos;ll need to create
                an account or sign in to your existing one.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col gap-3 w-full max-w-xs">
              <Button asChild className="w-full">
                <Link href="/register">
                  <UserPlus className="size-4" />
                  Sign Up
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">
                  <LogIn className="size-4" />
                  Sign In
                </Link>
              </Button>
            </div>

            {/* Additional Info */}
            <p className="text-xs text-muted-foreground">
              Accounts are free and help secure your MCP configurations
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Add Remote MCP Server Form */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-medium">
                  Add a remote MCP server (SSE) by providing a name and its URL
                  endpoint.
                </h3>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="server-name" className="text-sm">
                    Server Name
                  </Label>
                  <Input
                    id="server-name"
                    placeholder="mcp-server"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="bg-muted"
                    disabled={isAddingServer}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="server-url" className="text-sm">
                    Server URL
                  </Label>
                  <Input
                    id="server-url"
                    placeholder="https://example.com/mcp-server"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="bg-muted"
                    disabled={isAddingServer}
                  />
                </div>

                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    addServer();
                  }}
                  className="w-full"
                  style={{ marginTop: "1.5rem" }}
                  disabled={!serverName || !serverUrl || isAddingServer}
                >
                  {isAddingServer ? "Adding Server..." : "Add Server"}
                </Button>
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or
                </span>
              </div>
            </div>

            {/* Configure STDIO Button */}
            <Dialog
              open={isConfigDialogOpen}
              onOpenChange={setIsConfigDialogOpen}
            >
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={(e) => {
                    e.preventDefault();
                    openConfigDialog();
                  }}
                  disabled={isLoading}
                >
                  <Settings className="size-4 mr-2" />
                  Configure MCP Server (STDIO)
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                <DialogHeader>
                  <DialogTitle>MCP Server Configuration</DialogTitle>
                  <DialogDescription>
                    View and edit your MCP servers configuration file stored in
                    Firebase.
                  </DialogDescription>
                </DialogHeader>
                <div className="flex-1 overflow-hidden">
                  <div className="h-96 border rounded-md overflow-hidden">
                    <Editor
                      height="100%"
                      defaultLanguage="json"
                      value={editableConfig}
                      onChange={(value) => setEditableConfig(value || "")}
                      theme={theme === "dark" ? "vs-dark" : "light"}
                      options={{
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        wordWrap: "on",
                        fontSize: 13,
                      }}
                    />
                  </div>
                  {jsonError && (
                    <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                      {jsonError}
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <Button
                    variant="outline"
                    onClick={() => setIsConfigDialogOpen(false)}
                    disabled={isSaving}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={saveConfigChanges}
                    disabled={isSaving || !!jsonError}
                  >
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* MCP Servers List */}
            <div className="space-y-2">
              {mcpServers.length > 0 ? (
                mcpServers.map((server) => (
                  <div key={server.name} className="border rounded-lg">
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            toggleExpanded(server.name);
                          }}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {expandedServers[server.name] ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">
                            {server.name}
                          </span>
                          <div
                            className={`size-2 rounded-full ${
                              server.status === "connected"
                                ? "bg-green-500"
                                : server.status === "connecting"
                                ? "bg-yellow-500"
                                : "bg-red-500"
                            }`}
                            title={server.status}
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          className="p-1 hover:bg-muted rounded disabled:opacity-50"
                          onClick={(e) => {
                            e.preventDefault();
                            restartServer(server.name);
                          }}
                          disabled={restartingServers[server.name] || isLoading}
                        >
                          <RefreshCw
                            className={`size-4 transition-transform duration-300 ${
                              restartingServers[server.name]
                                ? "animate-spin"
                                : ""
                            }`}
                          />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            toggleServer(server.name, server.disabled ?? false);
                          }}
                          disabled={togglingServers[server.name]}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                            !server.disabled ? "bg-green-500" : "bg-gray-300"
                          }`}
                        >
                          <span
                            className={`inline-block size-3 rounded-full bg-white transition-transform ${
                              !server.disabled
                                ? "translate-x-5"
                                : "translate-x-1"
                            }`}
                          />
                        </button>
                      </div>
                    </div>

                    {/* Details of the server */}
                    {expandedServers[server.name] && (
                      <div className="border-t bg-muted/30 p-3">
                        <div className="space-y-3">
                          <h4 className="font-medium text-sm">Tools</h4>
                          {server.tools && server.tools.length > 0 ? (
                            <div className="space-y-4">
                              {server.tools.map((tool, index) => (
                                <div
                                  key={index}
                                  className="bg-background rounded-lg border p-4"
                                >
                                  <div className="space-y-3">
                                    {/* Tool Header */}
                                    <div className="flex items-start justify-between">
                                      <div className="space-y-1">
                                        <div className="flex items-center gap-2">
                                          <h5 className="font-semibold text-sm">
                                            {tool.name}
                                          </h5>
                                          {tool.autoApprove && (
                                            <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-[10px] font-medium">
                                              Auto-approve
                                            </span>
                                          )}
                                        </div>
                                        {tool.description && (
                                          <p className="text-muted-foreground text-xs leading-relaxed">
                                            {tool.description}
                                          </p>
                                        )}
                                      </div>
                                    </div>

                                    {/* Tool Parameters */}
                                    {tool.inputSchema && (
                                      <div className="border-t pt-3">
                                        {renderToolParameters(tool.inputSchema)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-6">
                              <p className="text-muted-foreground text-sm">
                                No tools available
                              </p>
                            </div>
                          )}

                          {/* Server Action Buttons */}
                          <div className="flex flex-col gap-2 mt-4 pt-3 border-t">
                            <Button
                              variant="outline"
                              className="w-full justify-center"
                              onClick={(e) => {
                                e.preventDefault();
                                restartServer(server.name);
                              }}
                              disabled={restartingServers[server.name] || isLoading}
                            >
                              <RotateCcw
                                className={`size-4 mr-2 transition-transform duration-500 ${
                                  restartingServers[server.name]
                                    ? "animate-spin"
                                    : ""
                                }`}
                              />
                              {restartingServers[server.name]
                                ? "Restarting..."
                                : "Restart Server"}
                            </Button>
                            <Button
                              variant="destructive"
                              className="w-full justify-center"
                              onClick={(e) => {
                                e.preventDefault();
                                deleteServerHandler(server.name);
                              }}
                              disabled={deletingServers[server.name]}
                            >
                              <Trash2 className="size-4 mr-2" />
                              {deletingServers[server.name] 
                                ? "Deleting..." 
                                : "Delete Server"
                              }
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                // Empty State
                <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
                  <div className="relative">
                    <div className="rounded-full bg-muted p-6">
                      <Boxes className="size-12 text-muted-foreground" />
                    </div>
                  </div>

                  <div className="space-y-2 max-w-sm">
                    <h3 className="text-lg font-semibold">
                      No MCP Servers Yet
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      You haven&apos;t added any MCP servers yet. Start by
                      adding a remote server above or configure STDIO servers to
                      get started!
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Plus className="size-3" />
                      <span>Add remote servers with URL endpoints</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Settings className="size-3" />
                      <span>Configure STDIO servers for local tools</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MCPHubContent;
