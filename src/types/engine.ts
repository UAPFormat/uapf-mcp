export interface EnginePackageProcess {
  id: string;
  bpmnProcessId: string;
  label?: string;
  requiredClaims?: string[];
}

export interface EnginePackageDecision {
  id: string;
  dmnDecisionId: string;
  label?: string;
  requiredClaims?: string[];
}

export interface EnginePackage {
  packageId: string;
  version: string;
  name?: string;
  description?: string;
  processes: EnginePackageProcess[];
  decisions: EnginePackageDecision[];
  tags?: string[];
  domain?: string;
  requiredClaims?: string[];
}

export interface EngineMeta {
  mode?: "workspace" | "packages";
  [key: string]: any;
}

export interface EngineArtifactResponse {
  data: ArrayBuffer;
  headers: Record<string, unknown>;
}

export interface EngineProcessExecutionRequest {
  packageId: string;
  processId: string;
  input: any;
}

export interface EngineDecisionEvaluationRequest {
  packageId: string;
  decisionId: string;
  input: any;
}

export interface EngineResolveResourcesRequest {
  packageId: string;
  processId?: string;
  taskId?: string;
}

export interface EngineValidationRequest {
  packageId?: string;
}
