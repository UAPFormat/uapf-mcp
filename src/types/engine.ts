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

export interface HostCapability {
  namespace: string;
  operation: string;
  version: number;
}

export interface HostManifest {
  hostDid: string;
  hostBaseUrl: string;
  profiles: string[];
  capabilities: HostCapability[];
  manifestSignature?: string;
}

// UAPF-IP v0.1 start-session request (POST /uapf/start-session).
// Replaces the legacy stateless EngineProcessExecutionRequest.
export interface EngineStartSessionRequest {
  packageId: string;
  packageVersion?: string;
  processId: string;
  input: any;
  hostManifest: HostManifest;
  guardrailsRef?: string;
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
