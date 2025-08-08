// Get MCPClient
import { MCPClient } from "./client";

// Types
import { McpConnection } from "./types";

// Shape OpenAI expects
export interface OpenAIToolDef {
	name: string;
	description?: string;
	parameters?: Record<string, any>;
}

export class ToolRegistry {
	private defs = new Map<
		string,
		{ def: OpenAIToolDef; run: (args: any) => Promise<any> }
	>();

	/** rebuild the registry whenever MCP connections change */
	rebuild(conns: McpConnection[], mcp: MCPClient) {
		this.defs.clear();

		for (const c of conns) {
			if (c.server.disabled || c.server.status !== "connected") {
				continue;
			}

			for (const t of c.server.tools ?? []) {
				const fq = `${c.server.name}__${t.name}`; // double underscore, allowed by OpenAI
				this.defs.set(fq, {
					def: {
						name: fq,
						description: t.description,
						parameters: t.inputSchema, // already JSON Schema
					},
					run: (args: any) => mcp.callTool(c.server.name, t.name, args),
				});
			}
		}
	}

	list(): OpenAIToolDef[] {
		return [...this.defs.values()].map((v) => v.def);
	}

	async invoke(name: string, args: any) {
		const entry = this.defs.get(name);
		if (!entry) {
			throw new Error(`Unknown tool "${name}"`);
		}
		return entry.run(args);
	}
}
