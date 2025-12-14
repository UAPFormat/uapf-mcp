import fetch from "node-fetch";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENGINE_URL = process.env.UAPF_ENGINE_URL || "http://localhost:3001";
const MCP_PORT = Number(process.env.MCP_PORT || 7900);
const MCP_HTTP_PATH = process.env.MCP_HTTP_PATH || "/mcp";
const MCP_BASE_URL = process.env.MCP_URL || `http://localhost:${MCP_PORT}`;
const MCP_TRANSPORT = process.env.MCP_TRANSPORT || "streamable_http";

async function callTool(path, options = {}) {
  const res = await fetch(`${ENGINE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${path} failed: ${res.status} ${body}`);
  }

  return res.json();
}

async function main() {
  console.log("Describe:");
  const describe = await callTool("/_/meta");
  console.log(JSON.stringify(describe, null, 2));

  console.log("\nPackages:");
  const packages = await callTool("/uapf/packages");
  console.log(JSON.stringify(packages, null, 2));

  if (!Array.isArray(packages) || packages.length === 0) {
    console.log("No packages available to fetch artifact or validate.");
    return;
  }

  const firstPackage = packages[0].packageId;
  console.log(`\nFetching manifest for ${firstPackage}`);
  const manifest = await callTool(`/uapf/packages/${encodeURIComponent(firstPackage)}/artifacts/manifest`);
  console.log(JSON.stringify(manifest, null, 2));

  console.log("\nValidate:");
  const validation = await callTool("/uapf/validate", {
    method: "POST",
    body: JSON.stringify({ packageId: firstPackage }),
  });
  console.log(JSON.stringify(validation, null, 2));

  if (MCP_TRANSPORT !== "streamable_http") {
    console.log(`\nSkipping MCP HTTP smoke; MCP_TRANSPORT=${MCP_TRANSPORT}`);
    return;
  }

  console.log("\nConnecting to MCP over Streamable HTTP:");
  const endpoint = new URL(MCP_HTTP_PATH, MCP_BASE_URL);
  const transport = new StreamableHTTPClientTransport(endpoint);
  const client = new Client({ name: "uapf-smoke", version: "0.0.0" });

  try {
    await client.connect(transport);

    console.log("\nMCP listTools:");
    const tools = await client.listTools();
    console.log(JSON.stringify(tools, null, 2));

    console.log("\nMCP uapf.describe:");
    const describeResult = await client.callTool({ name: "uapf.describe" });
    console.log(JSON.stringify(describeResult, null, 2));

    console.log("\nMCP uapf.list:");
    const listResult = await client.callTool({ name: "uapf.list" });
    console.log(JSON.stringify(listResult, null, 2));
  } finally {
    await transport.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
