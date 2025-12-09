export interface EnginePackageProcess {
  id: string;
  bpmnProcessId: string;
  label?: string;
}

export interface EnginePackageDecision {
  id: string;
  dmnDecisionId: string;
  label?: string;
}

export interface EnginePackageInfo {
  packageId: string;
  version: string;
  name?: string;
  description?: string;
  processes: EnginePackageProcess[];
  decisions: EnginePackageDecision[];
}

export interface ExecuteProcessResponse {
  applicationId?: string;
  status: string;
  outputs: any;
  explanations?: any[];
}

export interface EvaluateDecisionResponse {
  outputs: any;
  explanations?: any[];
}
