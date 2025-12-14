import { WebSocketServer, WebSocket } from "ws";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import {
  MCP_PORT,
  MCP_CORS_ORIGIN,
  MCP_HTTP_PATH,
  MCP_TRANSPORT,
  UAPF_ENGINE_MODE,
  UAPF_ENGINE_URL,
  UAPF_MCP_MODE,
  UAPF_MCP_NAME,
  UAPF_MCP_TOOL_PREFIX,
  UAPF_PACKAGE_PATH,
  UAPF_SECURITY_MODE,
  UAPF_WORKSPACE_DIR,
  UAPF_DIDVC_VERIFIER,
  UAPF_DIDVC_VERIFIER_URL,
} from "../config";
import { EngineClient, EngineClientError } from "../engine/engineClient";
import { registerTools } from "../mcp/registerTools";
import { registerResources } from "../mcp/resources";
import { NoneVerifier, HttpVerifier } from "../security/verifier";
import { EngineMeta, EnginePackage } from "../types/engine";
import { serveStreamableHttp } from "../transports/http";

class WebSocketServerTransport implements Transport {
  private wss: WebSocketServer;
  private socket?: WebSocket;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;
  sessionId?: string;
  setProtocolVersion?: (version: string) => void;

  constructor(private port: number, private path = "/mcp-ws") {
    this.wss = new WebSocketServer({ port: this.port, path: this.path });
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

function resolveMcpMode(meta?: EngineMeta): "package" | "workspace" {
  if (UAPF_MCP_MODE === "package") {
    if (!UAPF_PACKAGE_PATH) {
      throw new Error("UAPF_MCP_MODE=package requires UAPF_PACKAGE_PATH");
    }
    return "package";
  }
  if (UAPF_MCP_MODE === "workspace") {
    if (!UAPF_WORKSPACE_DIR) {
      throw new Error("UAPF_MCP_MODE=workspace requires UAPF_WORKSPACE_DIR");
    }
    return "workspace";
  }

  if (UAPF_WORKSPACE_DIR) return "workspace";
  if (UAPF_PACKAGE_PATH) return "package";
  if (meta?.mode === "workspace") return "workspace";
  return "package";
}

function resolveEngineMode(meta?: EngineMeta): "packages" | "workspace" {
  if (UAPF_ENGINE_MODE !== "auto") return UAPF_ENGINE_MODE;
  if (meta?.mode === "workspace") return "workspace";
  if (meta?.mode === "packages") return "packages";
  return "packages";
}

function pickPackagesForMode(mode: "package" | "workspace", packages: EnginePackage[]) {
  if (mode === "package" && packages.length > 0) {
    return [packages[0]];
  }
  return packages;
}

function getVerifier() {
  if (UAPF_DIDVC_VERIFIER === "http") {
    if (!UAPF_DIDVC_VERIFIER_URL) {
      throw new Error("UAPF_DIDVC_VERIFIER_URL is required when UAPF_DIDVC_VERIFIER=http");
    }
    return new HttpVerifier(UAPF_DIDVC_VERIFIER_URL);
  }
  return new NoneVerifier();
}

async function serveWebsocket(server: McpServer, port: number, path = "/mcp-ws") {
  const transport = new WebSocketServerTransport(port, path);
  await server.connect(transport);
  console.log(`${UAPF_MCP_NAME} listening on ws://0.0.0.0:${port}${path}`);
}

async function serveStdio(server: McpServer) {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log(`${UAPF_MCP_NAME} listening on stdio transport`);
}

async function main() {
  const client = new EngineClient();
  let meta: EngineMeta | undefined;
  try {
    meta = await client.getMeta();
  } catch (err) {
    if (err instanceof EngineClientError) {
      console.warn("Failed to fetch engine meta:", err.message);
    } else {
      console.warn("Failed to fetch engine meta:", (err as Error)?.message);
    }
  }

  const mode = resolveMcpMode(meta);
  const engineMode = resolveEngineMode(meta);
  const packages = await client.listPackages();
  const scopedPackages = pickPackagesForMode(mode, packages);

  if (scopedPackages.length === 0) {
    throw new Error("No UAPF packages available from engine");
  }

  const server = new McpServer({ name: UAPF_MCP_NAME, version: "0.1.0" });
  const verifier = getVerifier();

  registerTools({
    server,
    client,
    packages: scopedPackages,
    mode,
    engineMode,
    engineUrl: UAPF_ENGINE_URL,
    toolPrefix: UAPF_MCP_TOOL_PREFIX,
    securityMode: UAPF_SECURITY_MODE,
    claimsVerifier: verifier,
  });

  registerResources(server, client, scopedPackages, UAPF_SECURITY_MODE, verifier);

  switch (MCP_TRANSPORT) {
    case "streamable_http": {
      await serveStreamableHttp(server, MCP_PORT, MCP_HTTP_PATH, MCP_CORS_ORIGIN);
      break;
    }
    case "ws": {
      await serveWebsocket(server, MCP_PORT);
      break;
    }
    case "stdio": {
      await serveStdio(server);
      break;
    }
    case "sse": {
      throw new Error("SSE transport is not implemented. Use streamable_http or ws.");
    }
    default:
      throw new Error(`Unknown MCP_TRANSPORT=${MCP_TRANSPORT}`);
  }
}

main().catch((err) => {
  console.error("Failed to start uapf-mcp:", err);
  process.exit(1);
});
