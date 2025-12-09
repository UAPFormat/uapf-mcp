import axios from "axios";
import { UAPF_ENGINE_BASE_URL } from "../config";
import {
  EnginePackageInfo,
  ExecuteProcessResponse,
  EvaluateDecisionResponse,
} from "../types/engine";

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export class UapfEngineClient {
  async listPackages(): Promise<EnginePackageInfo[]> {
    const url = `${normalizeBaseUrl(UAPF_ENGINE_BASE_URL)}/uapf/packages`;
    const res = await axios.get(url);
    return res.data as EnginePackageInfo[];
  }

  async executeProcessOnce(params: {
    packageId: string;
    processId: string;
    input: any;
  }): Promise<ExecuteProcessResponse> {
    const url = `${normalizeBaseUrl(
      UAPF_ENGINE_BASE_URL
    )}/uapf/execute-process`;
    const res = await axios.post(url, params);
    return res.data as ExecuteProcessResponse;
  }

  async evaluateDecision(params: {
    packageId: string;
    decisionId: string;
    input: any;
  }): Promise<EvaluateDecisionResponse> {
    const url = `${normalizeBaseUrl(
      UAPF_ENGINE_BASE_URL
    )}/uapf/evaluate-decision`;
    const res = await axios.post(url, params);
    return res.data as EvaluateDecisionResponse;
  }
}
