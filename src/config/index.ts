import dotenv from "dotenv";

dotenv.config();

export const MCP_PORT = Number(process.env.MCP_PORT || 7900);

export type McpMode = "package" | "workspace" | "auto";
export type EngineMode = "packages" | "workspace" | "auto";
export type SecurityMode = "off" | "claims_declare" | "claims_enforce";
export type VerifierKind = "none" | "http";

export const UAPF_MCP_MODE: McpMode =
  (process.env.UAPF_MCP_MODE as McpMode) || "auto";

export const UAPF_PACKAGE_PATH = process.env.UAPF_PACKAGE_PATH;
export const UAPF_WORKSPACE_DIR = process.env.UAPF_WORKSPACE_DIR;

export const UAPF_ENGINE_URL =
  process.env.UAPF_ENGINE_URL || "http://localhost:3001";
export const UAPF_ENGINE_MODE: EngineMode =
  (process.env.UAPF_ENGINE_MODE as EngineMode) || "auto";

export const UAPF_MCP_NAME = process.env.UAPF_MCP_NAME || "uapf";
export const UAPF_MCP_TOOL_PREFIX =
  process.env.UAPF_MCP_TOOL_PREFIX || "uapf";

export const UAPF_SECURITY_MODE: SecurityMode =
  (process.env.UAPF_SECURITY_MODE as SecurityMode) || "claims_declare";

export const UAPF_DIDVC_VERIFIER: VerifierKind =
  (process.env.UAPF_DIDVC_VERIFIER as VerifierKind) || "none";
export const UAPF_DIDVC_VERIFIER_URL = process.env.UAPF_DIDVC_VERIFIER_URL;
