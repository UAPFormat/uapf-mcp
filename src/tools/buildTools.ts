import { z } from "zod";
import { AnySchema } from "@modelcontextprotocol/sdk/server/zod-compat";
import { EnginePackageInfo } from "../types/engine";
import { UapfEngineClient } from "../client/UapfEngineClient";

export interface BuiltToolDefinition {
  name: string;
  description: string;
  inputSchema: AnySchema;
  outputSchema: AnySchema;
  handler: (args: any) => Promise<any> | any;
}

function slugifyPackageId(packageId: string): string {
  return packageId.replace(/[^a-zA-Z0-9]+/g, "_").toLowerCase();
}

export function buildToolsForPackages(
  packages: EnginePackageInfo[],
  client: UapfEngineClient
): BuiltToolDefinition[] {
  const tools: BuiltToolDefinition[] = [];

  for (const pkg of packages) {
    const slug = slugifyPackageId(pkg.packageId);

    tools.push({
      name: `uapf_${slug}_describe_service`,
      description: `Describe the UAPF package ${pkg.packageId} (version ${pkg.version}).`,
      inputSchema: z.object({}),
      outputSchema: z.object({
        packageId: z.string(),
        version: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        processes: z.array(
          z.object({
            id: z.string(),
            bpmnProcessId: z.string(),
            label: z.string().optional(),
          })
        ),
        decisions: z.array(
          z.object({
            id: z.string(),
            dmnDecisionId: z.string(),
            label: z.string().optional(),
          })
        ),
      }),
      handler: async () => ({
        packageId: pkg.packageId,
        version: pkg.version,
        name: pkg.name,
        description: pkg.description,
        processes: pkg.processes,
        decisions: pkg.decisions,
      }),
    });

    tools.push({
      name: `uapf_${slug}_run_process`,
      description: `Execute a process from UAPF package ${pkg.packageId} once using uapf-engine.`,
      inputSchema: z.object({
        processId: z
          .string()
          .describe("Process id as defined in the UAPF manifest for this package."),
        input: z.unknown().describe("Structured JSON input expected by the process."),
      }),
      outputSchema: z.object({
        applicationId: z.string().optional(),
        status: z.string(),
        outputs: z.unknown(),
        explanations: z.array(z.unknown()).optional(),
      }),
      handler: async (args) => {
        const { processId, input } = args;

        return client.executeProcessOnce({
          packageId: pkg.packageId,
          processId,
          input,
        });
      },
    });

    tools.push({
      name: `uapf_${slug}_evaluate_decision`,
      description: `Evaluate a DMN decision from UAPF package ${pkg.packageId} using uapf-engine.`,
      inputSchema: z.object({
        decisionId: z
          .string()
          .describe("Decision id as defined in the UAPF manifest for this package."),
        input: z.unknown().describe("Structured JSON input expected by the decision."),
      }),
      outputSchema: z.object({
        outputs: z.unknown(),
        explanations: z.array(z.unknown()).optional(),
      }),
      handler: async (args) => {
        const { decisionId, input } = args;

        return client.evaluateDecision({
          packageId: pkg.packageId,
          decisionId,
          input,
        });
      },
    });
  }

  return tools;
}
