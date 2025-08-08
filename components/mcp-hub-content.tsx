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

// Context
import { useMCPClient } from "@/lib/mcp/context";

// Server actions
import { getMcpServers } from "@/lib/mcp/queries";

// Types
import { McpServer } from "@/lib/mcp/types";

type MCPHubContentProps = {
  setIsMCPHubOpen: (isOpen: boolean) => void;
};

const MCPHubContent = ({ setIsMCPHubOpen }: MCPHubContentProps) => {
  const { mcpClient } = useMCPClient();
  const { data } = useSession();
  const { theme } = useTheme();
  const isGuest = guestRegex.test(data?.user?.email ?? "");

  // State for form inputs
  const [serverName, setServerName] = useState("");
  const [serverUrl, setServerUrl] = useState("");
  const [isAddingRemoteServer, setIsAddingRemoteServer] = useState(false);
  const [expandedServers, setExpandedServers] = useState<
    Record<string, boolean>
  >({});
  const [restartingServers, setRestartingServers] = useState<
    Record<string, boolean>
  >({});
  const [isConfigDialogOpen, setIsConfigDialogOpen] = useState(false);
  const [savedMcpServers, setSavedMcpServers] = useState<Record<string, any>>(
    {}
  );
  const [editableConfig, setEditableConfig] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [jsonError, setJsonError] = useState("");

  // Mock MCP servers data
  const [mcpServers, setMcpServers] = useState<McpServer[]>([]);

  const toggleServer = async (serverName: string, disabled: boolean) => {
    toast.info(`MCP server "${serverName}" is being ${!disabled ? "disabled" : "enabled"}`);
    try {
      await mcpClient?.toggleServerDisabledMCP(serverName, !disabled);

      // Update the servers list
      setMcpServers(mcpClient?.getServers() ?? []);

      toast.success(`MCP server "${serverName}" was successfully ${!disabled ? "disabled" : "enabled"}`);
    } catch (error: any) {
      console.error("Error toggling server:", error);
      toast.error("Error toggling server: " + error.message);
    }
  };

  const toggleExpanded = (serverName: string) => {
    setExpandedServers((prev) => ({
      ...prev,
      [serverName]: !prev[serverName],
    }));
  };

  const addServer = async () => {
    if (serverName && serverUrl) {
      toast.info(`Adding MCP server "${serverName}". This may take a few seconds...`);
      setIsAddingRemoteServer(true);
      // Get our mcp client
      try {
        await mcpClient?.addRemoteServer(serverName, serverUrl);
        setIsAddingRemoteServer(false);
        toast.success("MCP server added successfully");
      } catch (error: any) {
        console.error("Error adding remote MCP server:", error);
        toast.error("Error adding remote MCP server: " + error.message);
      }

      setMcpServers(mcpClient?.getServers() ?? []);
      setServerName("");
      setServerUrl("");
    }
  };

  const restartServer = async (serverName: string) => {
    // Start rotation animation
    setRestartingServers((prev) => ({ ...prev, [serverName]: true }));

    try {
      // Restart logic
      console.log(`Restarting server: ${serverName}`);
      await mcpClient?.restartConnection(serverName);

      // Show success toast
      toast.success(`Server "${serverName}" restarted successfully`);

      // Update the servers list
      setMcpServers(mcpClient?.getServers() ?? []);
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

  const deleteServer = async (serverName: string) => {
    toast.info(`Deleting MCP server "${serverName}". This may take a few seconds...`);
    try {
      await mcpClient?.deleteServer(serverName);
      setMcpServers(mcpClient?.getServers() ?? []);
      toast.success(`MCP server "${serverName}" was successfully deleted`);
    } catch (error: any) {
      console.error("Error deleting server:", error);
      toast.error("Error deleting server: " + error.message);
    }
  };

  const saveConfigChanges = async () => {
    setIsSaving(true);
    setJsonError("");

    try {
      // Validate JSON format
      const parsedConfig = JSON.parse(editableConfig);

      if (!parsedConfig.mcpServers) {
        setJsonError("Configuration must include 'mcpServers' property");
        return;
      }

      // TODO: Update the local state with the new MCP servers

      // Update the local state
      // setMcpServers(newMcpServers);
      // setSavedMcpServers(parsedConfig);

      // TODO: Save to Firebase when save server action is implemented
      console.log("Configuration saved:", parsedConfig);

      // Close dialog on successful save
      setIsConfigDialogOpen(false);
    } catch (error) {
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
      setMcpServers(mcpClient?.getServers() ?? []);
    }
  }, []);

  // ------------------------------------------------------------ Render UI ------------------------------------------------------------

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
                  />
                </div>

                <Button
                  onClick={(e) => {
                    e.preventDefault();
                    addServer();
                  }}
                  className="w-full"
                  style={{ marginTop: "1.5rem" }}
                  disabled={!serverName || !serverUrl}
                >
                  {isAddingRemoteServer ? "Adding Server..." : "Add Server"}
                </Button>
              </div>
            </div>

            {/* <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or
                </span>
              </div>
            </div> */}

            {/* Configure STDIO Button */}
            {/* <Dialog
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
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="config-file"
                        className="text-sm font-medium"
                      >
                        Configuration File (JSON)
                      </Label>
                      <div className="relative">
                        <div className="border rounded-lg overflow-hidden">
                          <Editor
                            height="400px"
                            defaultLanguage="json"
                            value={editableConfig}
                            onChange={(value) => {
                              setEditableConfig(value || "");
                              setJsonError(""); // Clear error when user types
                            }}
                            theme={theme === "dark" ? "vs-dark" : "vs"}
                            options={{
                              minimap: { enabled: false },
                              scrollBeyondLastLine: false,
                              fontSize: 14,
                              lineNumbers: "on",
                              roundedSelection: false,
                              cursorStyle: "line",
                              automaticLayout: true,
                              wordWrap: "on",
                              wrappingIndent: "indent",
                              bracketPairColorization: { enabled: true },
                              formatOnPaste: true,
                              formatOnType: true,
                              tabSize: 2,
                              insertSpaces: true,
                              detectIndentation: false,
                              folding: true,
                              showFoldingControls: "always",
                              suggest: {
                                showKeywords: true,
                                showSnippets: true,
                                showInlineDetails: true,
                              },
                              quickSuggestions: {
                                other: true,
                                comments: true,
                                strings: true,
                              },
                            }}
                            onMount={(editor, monaco) => {
                              // Configure JSON validation
                              monaco.languages.json.jsonDefaults.setDiagnosticsOptions(
                                {
                                  validate: true,
                                  allowComments: false,
                                  schemas: [
                                    {
                                      uri: "http://example.com/mcp-config.json",
                                      fileMatch: ["*"],
                                      schema: {
                                        type: "object",
                                        properties: {
                                          mcpServers: {
                                            type: "object",
                                            additionalProperties: {
                                              type: "object",
                                              properties: {
                                                config: { type: "string" },
                                                status: {
                                                  type: "string",
                                                  enum: [
                                                    "connected",
                                                    "connecting",
                                                    "disconnected",
                                                  ],
                                                },
                                                disabled: { type: "boolean" },
                                                timeout: { type: "number" },
                                                error: { type: "string" },
                                              },
                                              // required: ["Here we can add properties that are required for the MCP server separeted by commas"],
                                            },
                                          },
                                        },
                                        required: ["mcpServers"],
                                      },
                                    },
                                  ],
                                }
                              );
                            }}
                          />
                        </div>
                        {jsonError && (
                          <div className="mt-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-2">
                            {jsonError}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      You can edit this JSON configuration directly. Make sure
                      to keep valid JSON format.
                      {mcpServers.length > 0 && (
                        <span className="block mt-1">
                          Currently showing {mcpServers.length} server(s).
                        </span>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-4 border-t">
                      <Button
                        variant="outline"
                        onClick={(e) => {
                          e.preventDefault();
                          setIsConfigDialogOpen(false);
                        }}
                        disabled={isSaving}
                      >
                        Cancel
                      </Button>
                      <Button
                        onClick={(e) => {
                          e.preventDefault();
                          saveConfigChanges();
                        }}
                        disabled={isSaving}
                      >
                        {isSaving ? "Saving..." : "Save Configuration"}
                      </Button>
                    </div>
                  </div>
                </div>
              </DialogContent>
            </Dialog> */}

            {/* MCP Servers List */}
            <div className="space-y-2">
              {mcpServers.length > 0 ? (
                mcpServers.map((server: McpServer) => (
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
                          disabled={restartingServers[server.name]}
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
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
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
                              disabled={restartingServers[server.name]}
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
                                deleteServer(server.name);
                              }}
                            >
                              <Trash2 className="size-4 mr-2" />
                              Delete Server
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
