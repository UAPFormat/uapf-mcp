import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EngineClient, EngineClientError } from "../engine/engineClient";
import { SecurityMode } from "../config";
import { ClaimsVerifier } from "../security/verifier";
import { EnginePackage } from "../types/engine";

function makeError(code: string, message: string) {
  return { error: { code, message } };
}

async function enforceClaims(
  requiredClaims: string[] | undefined,
  securityMode: SecurityMode,
  verifier: ClaimsVerifier,
  context: any
) {
  if (!requiredClaims || requiredClaims.length === 0) return { allowed: true };
  if (securityMode === "off") return { allowed: true };

  const result = await verifier.verify(requiredClaims, context);
  if (!result.ok && securityMode === "claims_enforce") {
    throw makeError("claims_not_satisfied", result.reason || "Required claims not satisfied");
  }

  return { allowed: true, requiredClaims, reason: result.reason };
}

function attachClaimsMeta(
  resource: { uri: string; mimeType?: string; text?: string; blob?: string; _meta?: any },
  requiredClaims: string[] | undefined,
  securityMode: SecurityMode
) {
  if (requiredClaims && requiredClaims.length > 0 && securityMode !== "off") {
    return { ...resource, _meta: { ...(resource._meta || {}), requiredClaims } };
  }
  return resource;
}

async function readArtifact(
  client: EngineClient,
  pkg: EnginePackage,
  kind: string,
  id?: string
): Promise<{ mimeType: string; text?: string; blob?: string }> {
  const res = await client.getArtifact(pkg.packageId, kind, id);
  if (kind === "manifest") {
    const jsonText = Buffer.from(res.data).toString();
    try {
      const pretty = JSON.stringify(JSON.parse(jsonText), null, 2);
      return { mimeType: "application/json", text: pretty };
    } catch {
      return { mimeType: "application/json", text: jsonText };
    }
  }

  const mimeType =
    (typeof res.headers["content-type"] === "string" && res.headers["content-type"]) ||
    "application/xml";
  return { mimeType, blob: Buffer.from(res.data).toString("base64") };
}

export function registerResources(
  server: McpServer,
  client: EngineClient,
  packages: EnginePackage[],
  securityMode: SecurityMode,
  verifier: ClaimsVerifier
) {
  const emptyListCallback = async () => ({ resources: [] });

  for (const pkg of packages) {
    const manifestTemplate = new ResourceTemplate(`uapf://manifest/${pkg.packageId}`, {
      list: async () => ({
        resources: [
          {
            uri: `uapf://manifest/${pkg.packageId}`,
            name: `Manifest for ${pkg.packageId}`,
            description: `UAPF manifest for package ${pkg.packageId}`,
            mimeType: "application/json",
          },
        ],
      }),
    });

    server.registerResource(
      `uapf-manifest-${pkg.packageId}`,
      manifestTemplate,
      { description: `UAPF manifest for package ${pkg.packageId}`, mimeType: "application/json" },
      async (uri: URL) => {
        try {
          const claims = await enforceClaims(
            pkg.requiredClaims,
            securityMode,
            verifier,
            { resource: uri.toString(), packageId: pkg.packageId, kind: "manifest" }
          );
          const artifact = await readArtifact(client, pkg, "manifest");
          return {
            contents: [
              attachClaimsMeta(
                {
                  uri: uri.toString(),
                  mimeType: artifact.mimeType,
                  text: artifact.text,
                },
                claims.requiredClaims,
                securityMode
              ),
            ],
          };
        } catch (err: any) {
          if (err?.error) return err;
          if (err instanceof EngineClientError) {
            return makeError(err.code, err.message);
          }
          return makeError("internal_error", (err as Error)?.message || "Unknown error");
        }
      }
    );

    const artifactKinds = [
      { kind: "bpmn", name: "BPMN diagram", mimeType: "application/xml" },
      { kind: "dmn", name: "DMN model", mimeType: "application/xml" },
      { kind: "cmmn", name: "CMMN model", mimeType: "application/xml" },
      { kind: "docs", name: "Documentation", mimeType: "application/xml" },
      { kind: "tests", name: "Test assets", mimeType: "application/xml" },
      { kind: "bindings", name: "Task bindings", mimeType: "application/json" },
      { kind: "policies", name: "Policies", mimeType: "application/json" },
    ];

    for (const artifact of artifactKinds) {
      const uriTemplate =
        artifact.kind === "bindings"
          ? new ResourceTemplate(`uapf://${artifact.kind}/${pkg.packageId}{?processId,taskId}`, {
              list: emptyListCallback,
            })
          : artifact.kind === "policies"
            ? new ResourceTemplate(`uapf://${artifact.kind}/${pkg.packageId}`, {
                list: async () => ({
                  resources: [
                    {
                      uri: `uapf://${artifact.kind}/${pkg.packageId}`,
                      name: `${artifact.name} for ${pkg.packageId}`,
                      description: `${artifact.name} for package ${pkg.packageId}`,
                      mimeType: artifact.mimeType,
                    },
                  ],
                }),
              })
            : new ResourceTemplate(`uapf://${artifact.kind}/${pkg.packageId}{?id}`, {
                list: emptyListCallback,
              });

      server.registerResource(
        `uapf-${artifact.kind}-${pkg.packageId}`,
        uriTemplate,
        { description: `${artifact.name} for package ${pkg.packageId}`, mimeType: artifact.mimeType },
        async (uri: URL) => {
          try {
            const searchParams = uri.searchParams;
            const id = searchParams.get("id") || undefined;
            const processId = searchParams.get("processId") || undefined;
            const taskId = searchParams.get("taskId") || undefined;
            const claims = await enforceClaims(
              pkg.requiredClaims,
              securityMode,
              verifier,
              { resource: uri.toString(), packageId: pkg.packageId, kind: artifact.kind, id, processId, taskId }
            );

            if (artifact.kind === "bindings") {
              const result = await client.resolveResources({
                packageId: pkg.packageId,
                processId,
                taskId,
              });
              const text = JSON.stringify(result, null, 2);
              return {
                contents: [
                  attachClaimsMeta(
                    { uri: uri.toString(), mimeType: "application/json", text },
                    claims.requiredClaims,
                    securityMode
                  ),
                ],
              };
            }

            if (artifact.kind === "policies") {
              const validation = await client.validate({ packageId: pkg.packageId });
              const text = JSON.stringify(validation, null, 2);
              return {
                contents: [
                  attachClaimsMeta(
                    { uri: uri.toString(), mimeType: "application/json", text },
                    claims.requiredClaims,
                    securityMode
                  ),
                ],
              };
            }

            const artifactContent = await readArtifact(client, pkg, artifact.kind === "bindings" ? "manifest" : artifact.kind, id);
            const contentEntry = artifactContent.blob
              ? { uri: uri.toString(), mimeType: artifactContent.mimeType, blob: artifactContent.blob }
              : { uri: uri.toString(), mimeType: artifactContent.mimeType, text: artifactContent.text };

            return {
              contents: [attachClaimsMeta(contentEntry, claims.requiredClaims, securityMode)],
            };
          } catch (err: any) {
            if (err?.error) return err;
            if (err instanceof EngineClientError) {
              return makeError(err.code, err.message);
            }
            return makeError("internal_error", (err as Error)?.message || "Unknown error");
          }
        }
      );
    }
  }
}
