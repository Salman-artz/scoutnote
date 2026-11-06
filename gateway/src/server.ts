import express, { Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import { config } from "./config.js";
import { mcpManager } from "./mcpManager.js";
import { runAgentLoop } from "./agentLoop.js";

dotenv.config();
dotenv.config({ path: "../.env" });

const app = express();

app.use(cors());
app.use(express.json());

// --- Health Check ---
const healthHandler = async (_req: Request, res: Response) => {
  const { mcp_a, mcp_b } = await mcpManager.checkHealth();
  const isHealthy = mcp_a && mcp_b;

  res.status(isHealthy ? 200 : 200).json({
    status: isHealthy ? "ok" : "degraded",
    gateway: true,
    mcp_a,
    mcp_b,
    timestamp: new Date().toISOString(),
  });
};

app.get("/health", healthHandler);
app.get("/api/health", healthHandler);

// --- Chat Completion (SSE) ---
const chatHandler = async (req: Request, res: Response) => {
  const messages = req.body?.messages;

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: "Bad Request: 'messages' harus berupa array percakapan non-kosong",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  await runAgentLoop(messages, res);
};

app.post("/chat", chatHandler);
app.post("/api/chat", chatHandler);

// --- Notes REST Endpoints (Proxied to MCP B) ---
const listNotesHandler = async (req: Request, res: Response) => {
  const limit = req.query.limit ? Number(req.query.limit) : 20;

  try {
    const result = await mcpManager.executeTool("notes__list_notes", { limit });
    if (result.status === "error") {
      res.status(500).json({ error: result.preview });
      return;
    }

    let notes = [];
    try {
      notes = JSON.parse(result.fullResult);
    } catch {
      notes = [];
    }

    res.json({ notes });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errMsg });
  }
};

app.get("/notes", listNotesHandler);
app.get("/api/notes", listNotesHandler);

const deleteNoteHandler = async (req: Request, res: Response) => {
  const id = Number(req.params.id);

  if (isNaN(id) || id <= 0) {
    res.status(400).json({ error: "ID catatan harus berupa angka positif" });
    return;
  }

  try {
    const result = await mcpManager.executeTool("notes__delete_note", { id });

    if (result.status === "error") {
      res.status(404).json({ error: result.preview });
      return;
    }

    res.json({
      success: true,
      id,
      message: "Catatan berhasil dihapus",
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: errMsg });
  }
};

app.delete("/notes/:id", deleteNoteHandler);
app.delete("/api/notes/:id", deleteNoteHandler);

export function startGatewayServer(portToUse?: number) {
  const port = portToUse || config.port;
  return new Promise<import("http").Server>((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[gateway] Server running on port ${port}`);
      resolve(server);
    });
  });
}

if (process.env.AUTO_START !== "false" && process.env.NODE_ENV !== "test") {
  startGatewayServer().catch((err) => {
    console.error("[gateway] Fatal startup error:", err);
    process.exit(1);
  });
}

export default app;
