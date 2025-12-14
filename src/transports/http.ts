import http from "node:http";
import { randomUUID } from "node:crypto";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

export async function serveStreamableHttp(
  server: McpServer,
  port: number,
  path = "/mcp",
  corsOrigin = "*",
) {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
  });

  const httpServer = http.createServer(async (req, res) => {
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Headers", "content-type, authorization, mcp-session-id");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");

    const accept = String(req.headers.accept ?? "");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && req.url === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }

    if (!req.url?.startsWith(path)) {
      res.writeHead(404);
      res.end();
      return;
    }

    const handleTransportRequest = async () => {
      try {
        await transport.handleRequest(req, res);
      } catch (err) {
        console.error("[mcp] streamable http error", err);
        if (!res.headersSent) {
          res.writeHead(500, { "content-type": "text/plain" });
        }
        if (!res.writableEnded) {
          res.end("Internal server error");
        }
      }
    };

    if (req.method === "POST") {
      await handleTransportRequest();
      return;
    }

    if (req.method === "GET") {
      if (accept.includes("text/event-stream")) {
        await handleTransportRequest();
        return;
      }

      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok", transport: "streamable_http" }));
      return;
    }

    res.writeHead(405);
    res.end();
  });

  await server.connect(transport);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("listening", () => resolve());
    httpServer.once("error", (err) => reject(err));
    httpServer.listen(port);
  });

  console.log(`[mcp] streamable http listening on http://0.0.0.0:${port}${path}`);
}
