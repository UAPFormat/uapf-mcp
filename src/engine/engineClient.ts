import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";
import fs from "node:fs";
import path from "node:path";
import {
  UAPF_ENGINE_URL,
  UAPF_DEBUG_LOG,
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

function ensureLogFile() {
  try {
    fs.mkdirSync(path.dirname(UAPF_DEBUG_LOG), { recursive: true });
  } catch (err) {
    console.warn("[engine-debug] Failed to create log directory", err);
  }
}

function formatPayload(payload: unknown): string {
  if (payload === undefined) return "undefined";
  if (payload === null) return "null";
  if (Buffer.isBuffer(payload)) return `<Buffer ${payload.length} bytes>`;
  if (payload instanceof ArrayBuffer)
    return `<ArrayBuffer ${(payload as ArrayBuffer).byteLength} bytes>`;
  if (payload instanceof Uint8Array)
    return `<Uint8Array ${(payload as Uint8Array).byteLength} bytes>`;
  if (typeof payload === "string") return payload;
  try {
    return JSON.stringify(payload);
  } catch (err) {
    return `[unserializable payload: ${(err as Error).message}]`;
  }
}

function formatHeaders(headers: AxiosResponse["headers"] | AxiosRequestConfig["headers"]) {
  try {
    return JSON.stringify(headers ?? {});
  } catch (err) {
    return `[unserializable headers: ${(err as Error).message}]`;
  }
}

function formatUrl(config: AxiosRequestConfig) {
  const base = config.baseURL?.replace(/\/$/, "") || "";
  const url = (config.url || "").startsWith("http")
    ? config.url
    : `${base}${config.url}`;
  return url || base || "<unknown-url>";
}

function appendDebugLog(message: string) {
  try {
    ensureLogFile();
    fs.appendFileSync(
      UAPF_DEBUG_LOG,
      `${new Date().toISOString()} ${message}\n`,
      "utf8",
    );
  } catch (err) {
    console.warn("[engine-debug] Failed to write debug log", err);
  }
}

http.interceptors.request.use((config) => {
  appendDebugLog(
    `[request] ${config.method?.toUpperCase() || "GET"} ${formatUrl(config)} ` +
      `headers=${formatHeaders(config.headers)} params=${formatPayload(config.params)} ` +
      `body=${formatPayload(config.data)}`,
  );
  return config;
});

http.interceptors.response.use(
  (response) => {
    appendDebugLog(
      `[response] ${response.config.method?.toUpperCase() || "GET"} ${formatUrl(response.config)} ` +
        `status=${response.status} headers=${formatHeaders(response.headers)} ` +
        `body=${formatPayload(response.data)}`,
    );
    return response;
  },
  (error) => {
    if (axios.isAxiosError(error)) {
      const { response } = error;
      if (response) {
        appendDebugLog(
          `[error-response] ${response.config?.method?.toUpperCase() || "GET"} ${formatUrl(response.config || {})} ` +
            `status=${response.status} headers=${formatHeaders(response.headers)} ` +
            `body=${formatPayload(response.data)}`,
        );
      } else {
        appendDebugLog(`[network-error] ${error.message}`);
      }
    } else {
      appendDebugLog(`[unknown-error] ${(error as Error)?.message}`);
    }
    return Promise.reject(error);
  },
);

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
