import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "../.env" });

export const config = {
  port: Number(process.env.PORT || process.env.GATEWAY_PORT || 3000),
  llm: {
    baseUrl: (
      process.env.LLM_BASE_URL ||
      "https://generativelanguage.googleapis.com/v1beta/openai/"
    ).replace(/\/+$/, ""),
    apiKey: (process.env.LLM_API_KEY || "").trim(),
    model: process.env.LLM_MODEL || "gemini-3.5-flash-lite",
  },
  exa: {
    url: process.env.EXA_MCP_URL || "https://mcp.exa.ai/mcp",
    apiKey: (process.env.EXA_API_KEY || "").trim(),
  },
  notes: {
    url:
      process.env.NOTES_MCP_URL ||
      process.env.MCP_NOTES_URL ||
      "http://localhost:3001/mcp",
    bearerToken: (process.env.MCP_BEARER_TOKEN || "dev-bearer-secret").trim(),
  },
};
