import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  EngineClient,
  EngineClientError,
} from "../engine/engineClient";
import { SecurityMode } from "../config";
import { ClaimsVerifier } from "../security/verifier";
import { EnginePackage } from "../types/engine";

interface RegisterToolsOptions {
  server: McpServer;
  client: EngineClient;
  packages: EnginePackage[];
  mode: "package" | "workspace";
  engineMode: "packages" | "workspace";
  engineUrl: string;
  toolPrefix: string;
  securityMode: SecurityMode;
  claimsVerifier: ClaimsVerifier;
}

const CANONICAL_TOOLS = [
  "uapf.describe",
  "uapf.list",
  "uapf.run_process",
  "uapf.evaluate_decision",
  "uapf.resolve_resources",
  "uapf.get_artifact",
  "uapf.validate",
];

function buildNames(base: string, prefix: string): string[] {
  const names = new Set<string>([base]);
  if (prefix && prefix !== "uapf") {
    names.add(`${prefix}.${base.split(".")[1]}`);
  }
  return Array.from(names.values());
}

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

function packageAllowed(packageId: string, packages: EnginePackage[]): boolean {
  return packages.some((pkg) => pkg.packageId === packageId);
}

function attachClaims(result: any, requiredClaims?: string[], securityMode?: SecurityMode) {
  if (requiredClaims && requiredClaims.length > 0 && securityMode && securityMode !== "off") {
    return { ...result, requiredClaims };
  }
  return result;
}

export function registerTools(options: RegisterToolsOptions) {
  const {
    server,
    client,
    packages,
    mode,
    engineMode,
    engineUrl,
    toolPrefix,
    securityMode,
    claimsVerifier,
  } = options;

  const packageMap = new Map<string, EnginePackage>();
  for (const pkg of packages) {
    packageMap.set(pkg.packageId, pkg);
  }

  const registerWithAliases = (
    baseName: string,
    description: string,
    inputSchema: any,
    outputSchema: any,
    handler: (args: any) => Promise<any>
  ) => {
    for (const name of buildNames(baseName, toolPrefix)) {
      server.registerTool(
        name,
        {
          description,
          inputSchema,
          outputSchema,
        },
        async (args: any) => {
          try {
            return await handler(args);
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
  };

  registerWithAliases(
    "uapf.describe",
    "Describe the UAPF MCP server.",
    z.object({}),
    z.object({}).passthrough(),
    async () => {
      const aliasList = Array.from(
        new Set(CANONICAL_TOOLS.flatMap((name) => buildNames(name, toolPrefix)))
      );
      const aliasMap = CANONICAL_TOOLS.reduce<Record<string, string[]>>((acc, name) => {
        acc[name] = buildNames(name, toolPrefix).filter((n) => n !== name);
        return acc;
      }, {});

      return {
        mode,
        engine: {
          url: engineUrl,
          mode: engineMode,
        },
        capabilities: {
          runProcess: true,
          evaluateDecision: true,
          validate: true,
          resolveResources: true,
        },
        tooling: {
          canonicalTools: CANONICAL_TOOLS,
          aliases: aliasList.map((name) => ({ name })),
          aliasMap,
        },
      };
    }
  );

  registerWithAliases(
    "uapf.list",
    "List available UAPF packages.",
    z
      .object({
        level: z.number().optional(),
        tag: z.string().optional(),
        domain: z.string().optional(),
        q: z.string().optional(),
      })
      .passthrough(),
    z.array(z.any()),
    async (args) => {
      const { tag, domain, q } = args || {};
      let packagesToReturn = [...packages];
      if (mode === "package" && packages.length > 0) {
        packagesToReturn = [packages[0]];
      }

      packagesToReturn = packagesToReturn.filter((pkg) => {
        const matchesTag = tag ? pkg.tags?.includes(tag) : true;
        const matchesDomain = domain ? pkg.domain === domain : true;
        const matchesQ = q
          ? (pkg.name || "").toLowerCase().includes(q.toLowerCase()) ||
            (pkg.description || "").toLowerCase().includes(q.toLowerCase())
          : true;
        return matchesTag && matchesDomain && matchesQ;
      });

      return packagesToReturn;
    }
  );

  registerWithAliases(
    "uapf.run_process",
    "Execute a UAPF process.",
    z.object({ packageId: z.string(), processId: z.string(), input: z.unknown() }).passthrough(),
    z.object({}).passthrough(),
    async (args) => {
      const { packageId, processId, input } = args;
      if (mode === "package" && packageId !== packages[0]?.packageId) {
        throw makeError(
          "package_mode_mismatch",
          `Package mode is locked to ${packages[0]?.packageId}`
        );
      }

      if (!packageAllowed(packageId, packages)) {
        throw makeError("unknown_package", `Package ${packageId} is not available`);
      }

      const pkg = packageMap.get(packageId);
      const process = pkg?.processes.find((p) => p.id === processId || p.bpmnProcessId === processId);
      const requiredClaims = process?.requiredClaims || pkg?.requiredClaims;
      const context = { tool: "run_process", packageId, processId };
      const result = await enforceClaims(requiredClaims, securityMode, claimsVerifier, context);
      const engineResult = await client.runProcess({ packageId, processId, input });
      return attachClaims(engineResult, result.requiredClaims, securityMode);
    }
  );

  registerWithAliases(
    "uapf.evaluate_decision",
    "Evaluate a UAPF decision.",
    z
      .object({ packageId: z.string(), decisionId: z.string(), input: z.unknown() })
      .passthrough(),
    z.object({}).passthrough(),
    async (args) => {
      const { packageId, decisionId, input } = args;
      if (mode === "package" && packageId !== packages[0]?.packageId) {
        throw makeError(
          "package_mode_mismatch",
          `Package mode is locked to ${packages[0]?.packageId}`
        );
      }

      if (!packageAllowed(packageId, packages)) {
        throw makeError("unknown_package", `Package ${packageId} is not available`);
      }

      const pkg = packageMap.get(packageId);
      const decision = pkg?.decisions.find((d) => d.id === decisionId || d.dmnDecisionId === decisionId);
      const requiredClaims = decision?.requiredClaims || pkg?.requiredClaims;
      const context = { tool: "evaluate_decision", packageId, decisionId };
      const result = await enforceClaims(requiredClaims, securityMode, claimsVerifier, context);
      const engineResult = await client.evaluateDecision({ packageId, decisionId, input });
      return attachClaims(engineResult, result.requiredClaims, securityMode);
    }
  );

  registerWithAliases(
    "uapf.resolve_resources",
    "Resolve UAPF resources for tasks.",
    z
      .object({ packageId: z.string(), processId: z.string().optional(), taskId: z.string().optional() })
      .passthrough(),
    z.object({}).passthrough(),
    async (args) => {
      const { packageId, processId, taskId } = args;
      if (mode === "package" && packageId !== packages[0]?.packageId) {
        throw makeError(
          "package_mode_mismatch",
          `Package mode is locked to ${packages[0]?.packageId}`
        );
      }

      if (!packageAllowed(packageId, packages)) {
        throw makeError("unknown_package", `Package ${packageId} is not available`);
      }

      const pkg = packageMap.get(packageId);
      const requiredClaims = pkg?.requiredClaims;
      const context = { tool: "resolve_resources", packageId, processId, taskId };
      const result = await enforceClaims(requiredClaims, securityMode, claimsVerifier, context);
      const engineResult = await client.resolveResources({ packageId, processId, taskId });
      return attachClaims(engineResult, result.requiredClaims, securityMode);
    }
  );

  registerWithAliases(
    "uapf.get_artifact",
    "Get a UAPF artifact (manifest, BPMN, DMN, docs, tests).",
    z
      .object({
        packageId: z.string(),
        kind: z.enum(["manifest", "bpmn", "dmn", "cmmn", "docs", "tests"]),
        id: z.string().optional(),
      })
      .passthrough(),
    z.object({}).passthrough(),
    async (args) => {
      const { packageId, kind, id } = args;
      if (mode === "package" && packageId !== packages[0]?.packageId) {
        throw makeError(
          "package_mode_mismatch",
          `Package mode is locked to ${packages[0]?.packageId}`
        );
      }

      if (!packageAllowed(packageId, packages)) {
        throw makeError("unknown_package", `Package ${packageId} is not available`);
      }

      const pkg = packageMap.get(packageId);
      const requiredClaims = pkg?.requiredClaims;
      const context = { tool: "get_artifact", packageId, kind, id };
      const result = await enforceClaims(requiredClaims, securityMode, claimsVerifier, context);
      const res = await client.getArtifact(packageId, kind, id);

      if (kind === "manifest") {
        const jsonText = Buffer.from(res.data).toString();
        let parsed: any = {};
        try {
          parsed = JSON.parse(jsonText);
        } catch (err) {
          parsed = { raw: jsonText };
        }
        return attachClaims(parsed, result.requiredClaims, securityMode);
      }

      const mimeType =
        (typeof res.headers["content-type"] === "string" && res.headers["content-type"]) ||
        "application/xml";

      const contentBase64 = Buffer.from(res.data).toString("base64");
      return attachClaims(
        {
          mediaType: mimeType,
          contentBase64,
        },
        result.requiredClaims,
        securityMode
      );
    }
  );

  registerWithAliases(
    "uapf.validate",
    "Validate a UAPF package or workspace.",
    z.object({ packageId: z.string().optional() }).passthrough(),
    z.object({}).passthrough(),
    async (args) => {
      const { packageId } = args || {};
      if (mode === "package") {
        const expected = packages[0]?.packageId;
        if (packageId && packageId !== expected) {
          throw makeError("package_mode_mismatch", `Package mode is locked to ${expected}`);
        }
        const requiredClaims = packages[0]?.requiredClaims;
        const result = await enforceClaims(
          requiredClaims,
          securityMode,
          claimsVerifier,
          { tool: "validate", packageId: expected }
        );
        const engineResult = await client.validate({ packageId: expected });
        return attachClaims(engineResult, result.requiredClaims, securityMode);
      }

      if (mode === "workspace") {
        if (packageId && !packageAllowed(packageId, packages)) {
          throw makeError("unknown_package", `Package ${packageId} is not available`);
        }
        const targetPackageId = packageId || undefined;
        const pkgClaims = targetPackageId ? packageMap.get(targetPackageId)?.requiredClaims : undefined;
        const result = await enforceClaims(
          pkgClaims,
          securityMode,
          claimsVerifier,
          { tool: "validate", packageId: targetPackageId }
        );
        const engineResult = await client.validate({ packageId: targetPackageId });
        return attachClaims(engineResult, result.requiredClaims, securityMode);
      }

      return { ok: true };
    }
  );

  return { canonicalTools: CANONICAL_TOOLS };
}
