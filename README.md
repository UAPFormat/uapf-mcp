# uapf-mcp

Reference **Model Context Protocol (MCP)** server for
[UAPF](https://github.com/UAPFormat/UAPF-spec) packages.

The server connects to a running [uapf-engine](https://github.com/UAPFormat/uapf-engine)
instance and exposes canonical MCP tools and resources for working with UAPF
packages in either **package** or **workspace** mode.

> Status: Early draft – APIs and tool names may change before UAPF v1.0.

---

## Modes: package vs workspace

The MCP server can target either a single `.uapf` package or an entire workspace
repository. Modes are derived from environment variables or engine metadata:

- `UAPF_MCP_MODE=package` – requires `UAPF_PACKAGE_PATH`.
- `UAPF_MCP_MODE=workspace` – requires `UAPF_WORKSPACE_DIR`.
- `UAPF_MCP_MODE=auto` (default) – prefers `UAPF_WORKSPACE_DIR`, then
  `UAPF_PACKAGE_PATH`, otherwise falls back to the engine mode reported by
  `/_/meta`.

When running in package mode:
- `uapf.list` always returns a singleton list.
- Tool calls using a different `packageId` return `package_mode_mismatch`.

When running in workspace mode:
- `uapf.list` returns the engine workspace inventory.
- `uapf.validate` without `packageId` validates the entire workspace.

---

## Configuration

```env
# MCP server
MCP_PORT=7900
MCP_TRANSPORT=streamable_http   # streamable_http | sse | ws | stdio
MCP_HTTP_PATH=/mcp
MCP_CORS_ORIGIN=*
UAPF_MCP_NAME=uapf
UAPF_MCP_TOOL_PREFIX=uapf

# Engine connectivity
UAPF_ENGINE_URL=http://localhost:3001
UAPF_ENGINE_MODE=auto  # packages | workspace | auto

# Mode selection
UAPF_MCP_MODE=auto     # package | workspace | auto
UAPF_PACKAGE_PATH=/path/to/package.uapf
UAPF_WORKSPACE_DIR=/path/to/workspace/repo

# Security
UAPF_SECURITY_MODE=claims_declare   # off | claims_declare | claims_enforce
UAPF_DIDVC_VERIFIER=none            # none | http
UAPF_DIDVC_VERIFIER_URL=            # required when verifier=http
```

Notes:
- `UAPF_ENGINE_URL` defaults to `http://localhost:3001`.
- `UAPF_SECURITY_MODE=claims_enforce` requires a verifier (see below).
- WebSocket mode is still available at `ws://<host>:MCP_PORT/mcp-ws` when
  `MCP_TRANSPORT=ws`.

---

## Canonical MCP tools

Tools are always registered with their canonical names below. If
`UAPF_MCP_TOOL_PREFIX` is set to a different prefix, prefixed aliases are also
registered but the canonical names remain discoverable.

- `uapf.describe`
- `uapf.list`
- `uapf.run_process`
- `uapf.evaluate_decision`
- `uapf.resolve_resources`
- `uapf.get_artifact`
- `uapf.validate`

### Tool shapes

- **uapf.describe** → `{ mode, engine: { url, mode }, capabilities, tooling }`
- **uapf.list** (optional filters: `level`, `tag`, `domain`, `q`) → array of
  package summaries
- **uapf.run_process** `{ packageId, processId, input }` → engine result
- **uapf.evaluate_decision** `{ packageId, decisionId, input }` → engine result
- **uapf.resolve_resources** `{ packageId, processId?, taskId? }` → engine
  bindings
- **uapf.get_artifact** `{ packageId, kind, id? }`
  - `kind=manifest` → JSON manifest
  - otherwise → `{ mediaType, contentBase64 }`
- **uapf.validate** `{ packageId? }` → `{ ok, issues[] }` (workspace or package)

---

## MCP resources

The server publishes read-only MCP resources backed by uapf-engine:

- `uapf://manifest/<packageId>`
- `uapf://bpmn/<packageId>?id=<processId>`
- `uapf://dmn/<packageId>?id=<decisionId>`
- `uapf://cmmn/<packageId>?id=<caseId>`
- `uapf://bindings/<packageId>?processId=...&taskId=...`
- `uapf://policies/<packageId>`

Resources are listed per package and served with the appropriate MIME type. BPMN,
DMN, and other XML artifacts are returned as base64-encoded blobs; manifests and
policies are returned as JSON text.

---

## Security modes and verifiers

The server supports basic claims propagation:

- `off` – no claim handling.
- `claims_declare` (default) – required claims are included in tool/resource
  responses but not enforced.
- `claims_enforce` – verifies required claims and blocks calls when verification
  fails.

Verifiers implement `ClaimsVerifier` from `src/security/verifier.ts`:

- `NoneVerifier` – always succeeds.
- `HttpVerifier` – POSTs `{ requiredClaims, context }` to
  `UAPF_DIDVC_VERIFIER_URL` and expects `{ ok, reason? }`.

In enforcement mode, unmet claims return a structured error with
`claims_not_satisfied`.

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
# MCP server listens on MCP_PORT (default 7900)
```

For development: `npm run dev`.

---

## Smoke test

A simple local sanity check is provided at `scripts/smoke.mjs`:

```bash
node scripts/smoke.mjs
```

The script calls `/_/meta`, lists packages, fetches the first manifest, and runs
validation against the first package. When `MCP_TRANSPORT=streamable_http`, it
also connects to the MCP server over HTTP to run `listTools`, `uapf.describe`,
and `uapf.list`.

---

## Deployment tips

- Ensure `uapf-engine` is reachable at `UAPF_ENGINE_URL` and configured for the
  desired mode (packages vs workspace).
- Set the MCP mode env vars to match the deployment target.
- Configure security mode and verifier URL according to your DID/VC pipeline.
