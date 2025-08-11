import { NextRequest, NextResponse } from "next/server";
import { getMcpClientInstance } from "@/lib/mcp/mcp-singleton-instance";

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get("x-user-id"); // or get from auth
    if (!userId) {
      return NextResponse.json({ error: "User ID required" }, { status: 401 });
    }

    const mcpClient = getMcpClientInstance(userId);
    const servers = mcpClient.getServers();

    return NextResponse.json({ servers });
  } catch (error) {
    console.error("Error getting servers:", error);
    return NextResponse.json(
      { error: "Failed to get servers" },
      { status: 500 }
    );
  }
}
