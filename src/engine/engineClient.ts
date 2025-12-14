import axios, { AxiosError } from "axios";
import {
  UAPF_ENGINE_URL,
} from "../config";
import {
  EngineArtifactResponse,
  EngineDecisionEvaluationRequest,
  EngineMeta,
  EnginePackage,
  EngineProcessExecutionRequest,
  EngineResolveResourcesRequest,
  EngineValidationRequest,
} from "../types/engine";

const http = axios.create({
  baseURL: UAPF_ENGINE_URL.replace(/\/$/, ""),
  timeout: 15000,
});

export class EngineClientError extends Error {
  code: string;
  status?: number;
  constructor(code: string, message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function wrapError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const axiosError = err as AxiosError<{ error?: { code?: string; message?: string } }>;
    const status = axiosError.response?.status;
    const code =
      axiosError.response?.data?.error?.code ||
      (status && status >= 500 ? "engine_unavailable" : "engine_request_failed");
    const message =
      axiosError.response?.data?.error?.message ||
      axiosError.message ||
      "Unknown engine error";
    throw new EngineClientError(code, message, status);
  }

  throw new EngineClientError("engine_request_failed", (err as Error)?.message || "Unknown error");
}

export class EngineClient {
  async getMeta(): Promise<EngineMeta> {
    try {
      const res = await http.get("/_/meta");
      return res.data as EngineMeta;
    } catch (err) {
      wrapError(err);
    }
  }

  async listPackages(): Promise<EnginePackage[]> {
    try {
      const res = await http.get("/uapf/packages");
      return res.data as EnginePackage[];
    } catch (err) {
      wrapError(err);
    }
  }

  async getPackage(packageId: string): Promise<EnginePackage> {
    try {
      const res = await http.get(`/uapf/packages/${encodeURIComponent(packageId)}`);
      return res.data as EnginePackage;
    } catch (err) {
      wrapError(err);
    }
  }

  async getArtifact(
    packageId: string,
    kind: string,
    id?: string
  ): Promise<EngineArtifactResponse> {
    try {
      const res = await http.get(
        `/uapf/packages/${encodeURIComponent(packageId)}/artifacts/${encodeURIComponent(kind)}`,
        {
          params: id ? { id } : undefined,
          responseType: "arraybuffer",
        }
      );
      return {
        data: res.data,
        headers: res.headers,
      };
    } catch (err) {
      wrapError(err);
    }
  }

  async resolveResources(body: EngineResolveResourcesRequest): Promise<any> {
    try {
      const res = await http.post("/uapf/resolve-resources", body);
      return res.data;
    } catch (err) {
      wrapError(err);
    }
  }

  async validate(body: EngineValidationRequest): Promise<any> {
    try {
      const res = await http.post("/uapf/validate", body);
      return res.data;
    } catch (err) {
      wrapError(err);
    }
  }

  async runProcess(body: EngineProcessExecutionRequest): Promise<any> {
    try {
      const res = await http.post("/uapf/execute-process", body);
      return res.data;
    } catch (err) {
      wrapError(err);
    }
  }

  async evaluateDecision(body: EngineDecisionEvaluationRequest): Promise<any> {
    try {
      const res = await http.post("/uapf/evaluate-decision", body);
      return res.data;
    } catch (err) {
      wrapError(err);
    }
  }
}
