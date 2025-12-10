import { WebSocketServer, WebSocket } from "ws";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { MCP_PORT } from "../config";
import { UapfEngineClient } from "../client/UapfEngineClient";
import { buildToolsForPackages } from "../tools/buildTools";

class WebSocketServerTransport implements Transport {
  private wss: WebSocketServer;
  private socket?: WebSocket;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;
  setProtocolVersion?: (version: string) => void;

  constructor(private port: number) {
    this.wss = new WebSocketServer({ port: this.port });
  }

  async start(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      if (this.wss.address()) {
        resolve();
        return;
      }

      this.wss.once("listening", () => resolve());
      this.wss.once("error", (err) => reject(err));
    });

    this.wss.on("connection", (ws) => {
      this.socket = ws;

      ws.on("message", (data) => {
        try {
          const parsed = JSON.parse(data.toString());
          this.onmessage?.(parsed);
        } catch (err) {
          this.onerror?.(err as Error);
        }
      });

      ws.on("close", () => {
        this.onclose?.();
      });

      ws.on("error", (err) => {
        this.onerror?.(err as Error);
      });
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected");
    }

    this.socket.send(JSON.stringify(message));
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.socket?.close();
      this.wss.close(() => resolve());
    });
    this.onclose?.();
  }
}

async function main() {
  const client = new UapfEngineClient();
  const packages = await client.listPackages();
  const tools = buildToolsForPackages(packages, client);

  const server = new McpServer({ name: "uapf-mcp", version: "0.1.0" });

    for (const tool of tools) {
      (server.registerTool as any)(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema,
        },
        async (args: any) => tool.handler(args)
      );
    }

  const transport = new WebSocketServerTransport(MCP_PORT);
  await server.connect(transport);
  console.log(`uapf-mcp listening on WebSocket port ${MCP_PORT}`);
}

main().catch((err) => {
  console.error("Failed to start uapf-mcp:", err);
  process.exit(1);
});
