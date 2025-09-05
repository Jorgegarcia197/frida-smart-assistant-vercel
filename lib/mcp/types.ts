// MCP imports
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

// Types
import type { McpServerConfig } from "./client";

export const DEFAULT_MCP_TIMEOUT_SECONDS = 60; // matches Anthropic's default timeout in their MCP SDK
export const MIN_MCP_TIMEOUT_SECONDS = 1;
export type McpMode = "full" | "server-use-only" | "off";

export type McpServer = {
	name: string;
	config: string;
	status: "connected" | "connecting" | "disconnected";
	error?: string;
	tools?: McpTool[];
	resources?: McpResource[];
	resourceTemplates?: McpResourceTemplate[];
	disabled?: boolean;
	timeout?: number;
};

export type McpServerFirebaseConfig = {
	mcpServers: Record<string, McpServerConfig>;
}

export type McpTool = {
	name: string;
	description?: string;
	inputSchema?: object;
	autoApprove?: boolean;
};

export type McpResource = {
	uri: string;
	name: string;
	mimeType?: string;
	description?: string;
};

export type McpResourceTemplate = {
	uriTemplate: string;
	name: string;
	description?: string;
	mimeType?: string;
};

export type McpResourceResponse = {
	_meta?: Record<string, any>;
	contents: Array<{
		uri: string;
		mimeType?: string;
		text?: string;
		blob?: string;
	}>;
};

export type McpToolCallResponse = {
	_meta?: Record<string, any>;
	content: (
		| { type: "text"; text: string }
		| { type: "image"; data: string; mimeType: string }
		| {
				type: "resource";
				resource: {
					uri: string;
					mimeType?: string;
					text?: string;
					blob?: string;
				};
		  }
		| { type: "audio"; data: string; mimeType: string }
	)[];
	isError?: boolean;
};

export type McpConnection = {
	server: McpServer;
	client: Client;
	transport: StdioClientTransport | SSEClientTransport;
};