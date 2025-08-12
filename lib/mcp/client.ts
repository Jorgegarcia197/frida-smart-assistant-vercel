// MCP imports
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Deep equal
import deepEqual from "fast-deep-equal";

// Zod
import { z } from "zod";

// Queries
import { getMcpServers, saveMcpServers } from "./queries";

// Types
import {
  McpConnection,
  MIN_MCP_TIMEOUT_SECONDS,
  DEFAULT_MCP_TIMEOUT_SECONDS,
  McpTool,
  McpResource,
  McpResourceTemplate,
  McpServer,
  McpToolCallResponse,
} from "./types";
import {
  CallToolResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  CallToolResult,
} from "@modelcontextprotocol/sdk/types.js";
import { secondsToMs } from "./utils";

// Default timeout for internal MCP data requests in milliseconds; is not the same as the user facing timeout stored as DEFAULT_MCP_TIMEOUT_SECONDS
const DEFAULT_REQUEST_TIMEOUT_MS = 5000;
const AutoApproveSchema = z.array(z.string()).default([]);

const BaseConfigSchema = z.object({
  autoApprove: AutoApproveSchema.optional(),
  disabled: z.boolean().optional(),
  timeout: z
    .number()
    .min(MIN_MCP_TIMEOUT_SECONDS)
    .optional()
    .default(DEFAULT_MCP_TIMEOUT_SECONDS),
});

const SseConfigSchema = BaseConfigSchema.extend({
  url: z.string().url(),
}).transform((config) => ({
  ...config,
  transportType: "sse" as const,
}));

const StdioConfigSchema = BaseConfigSchema.extend({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
}).transform((config) => ({
  ...config,
  transportType: "stdio" as const,
}));

const ServerConfigSchema = z.union([StdioConfigSchema, SseConfigSchema]);

export type McpServerConfig = z.infer<typeof ServerConfigSchema>;

export class MCPClient {
  // public properties
  public userId: string;

  // Variables
  connections: McpConnection[] = [];
  isConnecting: boolean = false;

  constructor(userId: string) {
    this.userId = userId;
  }

  /**
   * Initializes MCP servers that were already added from the db.
   */
  public async initializeMcpServers(): Promise<void> {
    try {
      const mcpServersConfig = await getMcpServers(this.userId);

      console.log(
        "MCP servers in initializeMcpServers of client.ts:",
        mcpServersConfig
      );

      if (mcpServersConfig && mcpServersConfig.mcpServers) {
        await this.updateServerConnections(mcpServersConfig.mcpServers);
        console.log(`Successfully initialized ${Object.keys(mcpServersConfig.mcpServers).length} MCP server(s) for user ${this.userId}`);
      } else {
        console.log(`No MCP servers found to initialize for user ${this.userId}`);
      }
    } catch (error) {
      console.error(`Error during MCP server initialization for user ${this.userId}:`, error);
      throw error; // Re-throw to trigger retry logic
    }
  }

  /**
   * Returns an array of all MCP servers (both enabled and disabled).
   * @returns Array of all McpServer objects
   */
  getServers(): McpServer[] {
    // Return all servers - UI will handle showing disabled state
    return this.connections.map((conn) => conn.server);
  }

  /**
   * Updates server connections based on new server configs.
   * @param newServers New server configs
   */
  async updateServerConnections(
    newServers: Record<string, McpServerConfig>
  ): Promise<void> {
    this.isConnecting = true;
    const currentNames = new Set(
      this.connections.map((conn) => conn.server.name)
    );
    const newNames = new Set(Object.keys(newServers));

    // Delete removed servers
    for (const name of currentNames) {
      if (!newNames.has(name)) {
        await this.deleteConnection(name);
      }
    }

    // Update or add servers
    for (const [name, config] of Object.entries(newServers)) {
      const currentConnection = this.connections.find(
        (conn) => conn.server.name === name
      );

      // Handle disabled servers
      if (config.disabled === true) {
        if (currentConnection) {
          // If server was enabled and now disabled, disconnect but keep the entry
          if (!currentConnection.server.disabled) {
            try {
              await currentConnection.transport.close();
              await currentConnection.client.close();
            } catch (error) {
              console.error(
                `Failed to close connection for disabled server ${name}:`,
                error
              );
            }
            currentConnection.server.status = "disconnected";
            currentConnection.server.disabled = true;
            console.log(`Disconnected disabled MCP server: ${name}`);
          }
        } else {
          // New disabled server - create entry without connecting
          this.connections.push({
            server: {
              name,
              config: JSON.stringify(config),
              status: "disconnected",
              disabled: true,
            },
            client: null as any, // We won't use these for disabled servers
            transport: null as any,
          });
        }
        continue;
      }

      // Handle enabled servers
      if (!currentConnection) {
        // New enabled server
        try {
          // if (config.transportType === "stdio") {
          //   this.setupFileWatcher(name, config);
          // }
          await this.newConnectToServer(name, config);
        } catch (error) {
          console.error(`Failed to connect to new MCP server ${name}:`, error);
          throw error;
        }
      } else if (
        !deepEqual(JSON.parse(currentConnection.server.config), config)
      ) {
        // Existing server with changed config
        try {
          // if (config.transportType === "stdio") {
          //   this.setupFileWatcher(name, config);
          // }
          await this.deleteConnection(name);
          await this.newConnectToServer(name, config);
          console.log(`Reconnected MCP server with updated config: ${name}`);
        } catch (error) {
          console.error(`Failed to reconnect MCP server ${name}:`, error);
        }
      } else if (currentConnection.server.disabled) {
        // Server was disabled and now enabled - connect it
        try {
          await this.newConnectToServer(name, config);
          console.log(`Re-enabled and connected MCP server: ${name}`);
        } catch (error) {
          console.error(
            `Failed to connect re-enabled MCP server ${name}:`,
            error
          );
        }
      }
      // If server exists with same config and is already enabled, do nothing
    }
    this.isConnecting = false;
  }

  /**
   * Connects to a new MCP server.
   * @param name Server name
   * @param config Server config
   */
  private async newConnectToServer(
    name: string,
    config: z.infer<typeof StdioConfigSchema> | z.infer<typeof SseConfigSchema>
  ): Promise<void> {
    // Remove existing connection if it exists (should never happen, the connection should be deleted beforehand)
    this.connections = this.connections.filter(
      (conn) => conn.server.name !== name
    );

    try {
      // Each MCP server requires its own transport connection and has unique capabilities, configurations, and error handling. Having separate clients also allows proper scoping of resources/tools and independent server management like reconnection.
      const client = new Client(
        {
          name: "frida-smart-assistant-mcp-client",
          version: "1.0.0",
        },
        {
          capabilities: {},
        }
      );

      let transport: StdioClientTransport | SSEClientTransport;

      if (config.transportType === "sse") {
        console.log("Creating SSE transport for:", name);
        transport = new SSEClientTransport(new URL(config.url), {});
      } else {
        console.log("Creating stdio transport for:", name);
        transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: {
            ...config.env,
            ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
            // ...(process.env.NODE_PATH ? { NODE_PATH: process.env.NODE_PATH } : {}),
          },
          stderr: "pipe", // necessary for stderr to be available
        });
      }

      transport.onerror = async (error) => {
        console.error(`Transport error for "${name}":`, error);
        const connection = this.connections.find(
          (conn) => conn.server.name === name
        );
        if (connection) {
          connection.server.status = "disconnected";
          // this.appendErrorMessage(connection, error.message);
        }
      };

      transport.onclose = async () => {
        const connection = this.connections.find(
          (conn) => conn.server.name === name
        );
        if (connection) {
          connection.server.status = "disconnected";
        }
      };

      const connection: McpConnection = {
        server: {
          name,
          config: JSON.stringify(config),
          status: "connecting",
          disabled: config.disabled,
        },
        client,
        transport,
      };
      this.connections.push(connection);

      if (config.transportType === "stdio") {
        // transport.stderr is only available after the process has been started. However we can't start it separately from the .connect() call because it also starts the transport. And we can't place this after the connect call since we need to capture the stderr stream before the connection is established, in order to capture errors during the connection process.
        // As a workaround, we start the transport ourselves, and then monkey-patch the start method to no-op so that .connect() doesn't try to start it again.
        await transport.start();
        const stderrStream = (transport as StdioClientTransport).stderr;
        if (stderrStream) {
          stderrStream.on("data", async (data: Buffer) => {
            const output = data.toString();
            // Check if output contains INFO level log
            const isInfoLog = !/\berror\b/i.test(output);

            if (isInfoLog) {
              // Log normal informational messages
              console.info(`Server "${name}" info:`, output);
            } else {
              // Treat as error log
              console.error(`Server "${name}" stderr:`, output);
              const connection = this.connections.find(
                (conn) => conn.server.name === name
              );
              if (connection) {
                // this.appendErrorMessage(connection, output);
                // Only notify webview if server is already disconnected
                // if (connection.server.status === "disconnected") {
                //   await this.notifyWebviewOfServerChanges();
                // }
              }
            }
          });
        } else {
          console.error(`No stderr stream for ${name}`);
        }
        transport.start = async () => {}; // No-op now, .connect() won't fail
      }

      // Connect
      await client.connect(transport);

      connection.server.status = "connected";
      connection.server.error = "";

      // Initial fetch of tools and resources
      connection.server.tools = await this.fetchToolsList(name);
      connection.server.resources = await this.fetchResourcesList(name);
      connection.server.resourceTemplates =
        await this.fetchResourceTemplatesList(name);
    } catch (error) {
      // Update status with error
      const connection = this.connections.find(
        (conn) => conn.server.name === name
      );
      if (connection) {
        connection.server.status = "disconnected";
        // this.appendErrorMessage(
        //   connection,
        //   error instanceof Error ? error.message : String(error)
        // );
      }
      throw error;
    }
  }

  /**
   * Fetches the list of tools for a server.
   * @param serverName Server name
   * @returns List of tools
   */
  private async fetchToolsList(serverName: string): Promise<McpTool[]> {
    try {
      const connection = this.connections.find(
        (conn) => conn.server.name === serverName
      );

      if (!connection) {
        throw new Error(`No connection found for server: ${serverName}`);
      }

      const response = await connection.client.request(
        { method: "tools/list" },
        ListToolsResultSchema,
        {
          timeout: DEFAULT_REQUEST_TIMEOUT_MS,
        }
      );

      // Get autoApprove settings
      const mcpServersConfig = await getMcpServers(this.userId);
      const autoApproveConfig =
        mcpServersConfig.mcpServers[serverName]?.autoApprove || [];

      // Mark tools as always allowed based on settings
      const tools = (response?.tools || []).map((tool) => ({
        ...tool,
        autoApprove: autoApproveConfig.includes(tool.name),
      }));

      return tools;
    } catch (error) {
      console.error(`Failed to fetch tools for ${serverName}:`, error);
      return [];
    }
  }

  /**
   * Fetches the list of resources for a server.
   * @param serverName Server name
   * @returns List of resources
   */
  private async fetchResourcesList(serverName: string): Promise<McpResource[]> {
    try {
      const response = await this.connections
        .find((conn) => conn.server.name === serverName)
        ?.client.request(
          { method: "resources/list" },
          ListResourcesResultSchema,
          { timeout: DEFAULT_REQUEST_TIMEOUT_MS }
        );
      return response?.resources || [];
    } catch (error) {
      // console.error(`Failed to fetch resources for ${serverName}:`, error)
      return [];
    }
  }

  /**
   * Fetches the list of resource templates for a server.
   * @param serverName Server name
   * @returns List of resource templates
   */
  private async fetchResourceTemplatesList(
    serverName: string
  ): Promise<McpResourceTemplate[]> {
    try {
      const response = await this.connections
        .find((conn) => conn.server.name === serverName)
        ?.client.request(
          { method: "resources/templates/list" },
          ListResourceTemplatesResultSchema,
          {
            timeout: DEFAULT_REQUEST_TIMEOUT_MS,
          }
        );

      return response?.resourceTemplates || [];
    } catch (error) {
      // console.error(`Failed to fetch resource templates for ${serverName}:`, error)
      return [];
    }
  }

  /**
   * Adds a new remote MCP server (SSE) to the firebase and updates the server connections.
   *
   * This method validates the server name and URL, updates the settings file,
   * and triggers a refresh of the server connections and webview.
   *
   * @param serverName - The unique name for the new MCP server.
   * @param serverUrl - The URL of the remote MCP server (must be a valid URL).
   * @throws If the settings file cannot be read, the server name already exists, or the URL is invalid.
   */
  public async addRemoteServer(
    serverName: string,
    serverUrl: string
  ): Promise<void> {
    console.log("Adding remote MCP server:", serverName, serverUrl);

    try {
      // Get current MCP servers for this user
      const currentServers = await getMcpServers(this.userId);

      if (!currentServers) {
        throw new Error("Failed to read MCP config");
      }

      if (currentServers.mcpServers[serverName]) {
        throw new Error(
          `An MCP server with the name "${serverName}" already exists`
        );
      }

      const urlValidation = z.string().url().safeParse(serverUrl);
      if (!urlValidation.success) {
        throw new Error(
          `Invalid server URL: ${serverUrl}. Please provide a valid URL.`
        );
      }

      const serverConfig = {
        url: serverUrl,
        disabled: false,
        autoApprove: [],
      };

      const parsedConfig = ServerConfigSchema.parse(serverConfig);
      currentServers.mcpServers[serverName] = parsedConfig;

      // Save the updated config to Firebase
      await saveMcpServers(this.userId, currentServers);

      // Update server connections
      await this.updateServerConnections(currentServers.mcpServers);

      console.log("Successfully added remote MCP server:", serverName);
    } catch (error) {
      console.error("Failed to add remote MCP server:", error);
      throw error;
    }
  }

  /**
   * Adds a new stdio MCP server to the firebase and updates the server connections.
   */
  public async addStdioServer(): Promise<void> {
    console.log("Adding stdio MCP server");

    try {
      // Get current MCP servers for this user
      const currentServers = await getMcpServers(this.userId);

      if (!currentServers) {
        throw new Error("Failed to read MCP config");
      }

      // Update server connections
      await this.updateServerConnections(currentServers.mcpServers);

      console.log("Successfully added stdio MCP server");
    } catch (error) {
      console.error("Failed to add stdio MCP server:", error);
      throw error;
    }
  }

  /**
   * Toggles the disabled state of a server and updates the settings file.
   * @param serverName Server name
   * @param disabled New disabled state
   */
  public async toggleServerDisabledMCP(serverName: string, disabled: boolean) {
    try {
      const config = await getMcpServers(this.userId);
      if (!config) {
        throw new Error("Failed to read or validate MCP settings");
      }

      if (config.mcpServers[serverName]) {
        config.mcpServers[serverName].disabled = disabled;

        // Save the updated config to Firebase
        await saveMcpServers(this.userId, config);

        // Update server connections to reflect the change
        await this.updateServerConnections(config.mcpServers);
      }
    } catch (error) {
      console.error("Failed to update server disabled state:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      throw error;
    }
  }

  /**
	 * Calls a tool on a specific MCP server.
	 * @param serverName - The name of the MCP server to call the tool on.
	 * @param toolName - The name of the tool to call.
	 * @param toolArguments - The arguments to pass to the tool.
	 * @returns A promise that resolves to the response from the tool.
	 */
	async callTool(
		serverName: string,
		toolName: string,
		toolArguments?: Record<string, unknown>
	): Promise<CallToolResult> {
		const connection = this.connections.find(
			(conn) => conn.server.name === serverName
		);
		if (!connection) {
			throw new Error(
				`No connection found for server: ${serverName}. Please make sure to use MCP servers available under 'Connected MCP Servers'.`
			);
		}

		if (connection.server.disabled) {
			throw new Error(`Server "${serverName}" is disabled and cannot be used`);
		}

		let timeout = secondsToMs(DEFAULT_MCP_TIMEOUT_SECONDS); // sdk expects ms

		try {
			const config = JSON.parse(connection.server.config);
			const parsedConfig = ServerConfigSchema.parse(config);
			timeout = secondsToMs(parsedConfig.timeout);
		} catch (error) {
			console.error(
				`Failed to parse timeout configuration for server ${serverName}: ${error}`
			);
		}

		return await connection.client.request(
			{
				method: "tools/call",
				params: {
					name: toolName,
					arguments: toolArguments,
				},
			},
			CallToolResultSchema,
			{
				timeout,
			}
		);
	}

  /**
   * Restarts a server connection.
   * @param serverName Server name
   */
  async restartConnection(serverName: string): Promise<void> {
    this.isConnecting = true;

    // Get existing connection and update its status
    const connection = this.connections.find(
      (conn) => conn.server.name === serverName
    );
    const config = connection?.server.config;
    if (config) {
      connection.server.status = "connecting";
      connection.server.error = "";
      // await setTimeoutPromise(500); // artificial delay to show user that server is restarting
      try {
        await this.deleteConnection(serverName);
        // Try to connect again using existing config
        await this.newConnectToServer(serverName, JSON.parse(config));
      } catch (error) {
        console.error(`Failed to restart connection for ${serverName}:`, error);
        throw error;
      }
    }

    this.isConnecting = false;
  }

  /**
   * Deletes a server connection.
   * @param name Server name
   */
  async deleteConnection(name: string): Promise<void> {
    const connection = this.connections.find(
      (conn) => conn.server.name === name
    );
    if (connection) {
      try {
        // Only close if transport and client exist (not null for disabled servers)
        if (connection.transport) {
          await connection.transport.close();
        }
        if (connection.client) {
          await connection.client.close();
        }
      } catch (error) {
        console.error(`Failed to close transport for ${name}:`, error);
      }
      this.connections = this.connections.filter(
        (conn) => conn.server.name !== name
      );
    }
  }

  /**
	 * Deletes a server from the settings and updates connections.
	 * @param serverName Server name
	 */
	public async deleteServer(serverName: string) {
		try {
			const config = await getMcpServers(this.userId);
			if (!config.mcpServers || typeof config.mcpServers !== "object") {
				config.mcpServers = {};
			}
			if (config.mcpServers[serverName]) {
				delete config.mcpServers[serverName];
				await saveMcpServers(this.userId, config);
				await this.updateServerConnections(config.mcpServers);
			} else {
				throw new Error(`${serverName} not found in MCP configuration`);
			}
		} catch (error) {
      console.error("Failed to delete server:", error);
			throw error;
		}
	}

  /**
   * Disconnects all server connections.
   */
  async disconnectAll(): Promise<void> {
    console.log(`Disconnecting all MCP connections for user ${this.userId}`);

    const disconnectPromises = this.connections.map(async (connection) => {
      try {
        await connection.transport.close();
        await connection.client.close();
      } catch (error) {
        console.error(
          `Failed to close connection for ${connection.server.name}:`,
          error
        );
      }
    });

    await Promise.all(disconnectPromises);
    this.connections = [];

    console.log(`All MCP connections disconnected for user ${this.userId}`);
  }
}
