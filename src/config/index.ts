import dotenv from "dotenv";

dotenv.config();

export const MCP_PORT = Number(process.env.MCP_PORT || 7900);

export const UAPF_ENGINE_BASE_URL =
  process.env.UAPF_ENGINE_BASE_URL || "http://127.0.0.1:4000";
