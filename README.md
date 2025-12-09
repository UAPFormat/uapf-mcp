# uapf-mcp

Reference **Model Context Protocol (MCP)** server for
[UAPF](https://github.com/UAPFormat/UAPF-spec) packages.

This service exposes UAPF packages as MCP tools by calling a running
[uapf-engine](https://github.com/UAPFormat/uapf-engine) instance over HTTP.

It is designed to be deployed behind `algomation.io` (WAMP + Apache) and consumed by
MCP-capable AI agents, including Neksus agents and other MCP hosts.

> Status: Early draft – APIs and tool names may change before UAPF v1.0.

---

## What it does

- Discovers available UAPF packages by calling `uapf-engine`:
  - `GET /uapf/packages`
- Dynamically registers MCP tools for each package:
  - `uapf_{slug}_describe_service`
  - `uapf_{slug}_run_process`
  - `uapf_{slug}_evaluate_decision`
- Forwards tool calls to `uapf-engine` via HTTP:
  - `POST /uapf/execute-process`
  - `POST /uapf/evaluate-decision`

The MCP server itself does **not** execute BPMN/DMN/CMMN; it delegates to `uapf-engine`.

---

## Configuration

The server is configured via environment variables:

- `MCP_PORT`  
  WebSocket port for the MCP server.  
  Default: `7900`.

- `UAPF_ENGINE_BASE_URL`  
  Base URL of the `uapf-engine` HTTP service.  
  Examples:
  - Local dev: `http://127.0.0.1:4000`
  - Behind WAMP: `https://algomation.io/uapf-engine`

Example `.env`:

```env
MCP_PORT=7900
UAPF_ENGINE_BASE_URL=https://algomation.io/uapf-engine
```

---

## Installation

```bash
git clone https://github.com/UAPFormat/uapf-mcp.git
cd uapf-mcp
npm install
```

## Build and run

```bash
npm run build
npm run start
# MCP server will listen on MCP_PORT (default 7900)
```

### For development

```bash
npm run dev
```

---

## MCP tools

For each UAPF package discovered from uapf-engine, the server registers:

### `uapf_{slug}_describe_service`
Describe the package and its entry points.

**Input:**

```json
{}
```

**Output:**

```json
{
  "packageId": "string",
  "version": "string",
  "name": "string",
  "description": "string",
  "processes": [
    {
      "id": "string",
      "bpmnProcessId": "string",
      "label": "string"
    }
  ],
  "decisions": [
    {
      "id": "string",
      "dmnDecisionId": "string",
      "label": "string"
    }
  ]
}
```

### `uapf_{slug}_run_process`
Execute a process from that package once.

**Input:**

```json
{
  "processId": "string",
  "input": { "any": "structured JSON expected by the process" }
}
```

**Output:**

```json
{
  "applicationId": "string (optional)",
  "status": "string",
  "outputs": {},
  "explanations": ["..."]
}
```

### `uapf_{slug}_evaluate_decision`
Evaluate a DMN decision from that package.

**Input:**

```json
{
  "decisionId": "string",
  "input": { "any": "structured JSON expected by the decision" }
}
```

**Output:**

```json
{
  "outputs": {},
  "explanations": ["..."]
}
```

The exact shapes of input and outputs depend on each package; in future versions,
schemas from the UAPF manifest may be used to tighten these definitions.
