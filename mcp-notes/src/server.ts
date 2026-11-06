import express, { Request, Response, NextFunction } from "express";
import dotenv from "dotenv";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { pool, migrate } from "./db.js";

dotenv.config();
dotenv.config({ path: "../.env" });

const app = express();
app.use(express.json());

// ponytail: in-memory session map sufficient for single-instance MCP; upgrade to Redis store when scaled horizontally.
const sessions = new Map<string, StreamableHTTPServerTransport>();

function logToolExecution(entry: {
  timestamp: string;
  requestId: string;
  tool: string;
  durationMs: number;
  status: "success" | "error";
  error?: string;
}) {
  console.log(JSON.stringify(entry));
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "mcp-notes",
    version: "1.0.0",
  });

  server.tool(
    "save_note",
    "Simpan catatan baru ke basis data PostgreSQL",
    {
      title: z.string().min(1, "Judul catatan tidak boleh kosong").max(255),
      content: z.string().min(1, "Konten catatan tidak boleh kosong"),
      source_url: z.string().optional(),
    },
    async ({ title, content, source_url }) => {
      const startTime = Date.now();
      const requestId = randomUUID();

      try {
        const { rows } = await pool.query(
          `INSERT INTO notes (title, content, source_url)
           VALUES ($1, $2, $3)
           RETURNING id, title, content, source_url, tags, created_at, updated_at`,
          [title.trim(), content.trim(), source_url?.trim() || null]
        );

        logToolExecution({
          timestamp: new Date().toISOString(),
          requestId,
          tool: "save_note",
          durationMs: Date.now() - startTime,
          status: "success",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(rows[0], null, 2) }],
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logToolExecution({
          timestamp: new Date().toISOString(),
          requestId,
          tool: "save_note",
          durationMs: Date.now() - startTime,
          status: "error",
          error: errMsg,
        });

        return {
          isError: true,
          content: [{ type: "text", text: `Database error saat menyimpan catatan: ${errMsg}` }],
        };
      }
    }
  );

  server.tool(
    "list_notes",
    "Ambil daftar catatan tersimpan dari basis data PostgreSQL",
    {
      limit: z.number().int().min(1).max(100).default(20).optional(),
    },
    async ({ limit }) => {
      const startTime = Date.now();
      const requestId = randomUUID();
      const safeLimit = Math.min(Math.max(limit ?? 20, 1), 100);

      try {
        const { rows } = await pool.query(
          `SELECT id, title, content, source_url, tags, created_at, updated_at
           FROM notes
           ORDER BY created_at DESC
           LIMIT $1`,
          [safeLimit]
        );

        logToolExecution({
          timestamp: new Date().toISOString(),
          requestId,
          tool: "list_notes",
          durationMs: Date.now() - startTime,
          status: "success",
        });

        return {
          content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logToolExecution({
          timestamp: new Date().toISOString(),
          requestId,
          tool: "list_notes",
          durationMs: Date.now() - startTime,
          status: "error",
          error: errMsg,
        });

        return {
          isError: true,
          content: [{ type: "text", text: `Database error saat mengambil catatan: ${errMsg}` }],
        };
      }
    }
  );

  server.tool(
    "delete_note",
    "Hapus catatan dari basis data berdasarkan ID",
    {
      id: z.number().int().positive("ID catatan harus berupa bilangan bulat positif"),
    },
    async ({ id }) => {
      const startTime = Date.now();
      const requestId = randomUUID();

      try {
        const { rowCount } = await pool.query(
          "DELETE FROM notes WHERE id = $1 RETURNING id",
          [id]
        );

        if (!rowCount || rowCount === 0) {
          logToolExecution({
            timestamp: new Date().toISOString(),
            requestId,
            tool: "delete_note",
            durationMs: Date.now() - startTime,
            status: "error",
            error: "Not found",
          });

          return {
            isError: true,
            content: [{ type: "text", text: `Catatan dengan ID ${id} tidak ditemukan` }],
          };
        }

        logToolExecution({
          timestamp: new Date().toISOString(),
          requestId,
          tool: "delete_note",
          durationMs: Date.now() - startTime,
          status: "success",
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ success: true, id, message: `Catatan ${id} berhasil dihapus` }),
            },
          ],
        };
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logToolExecution({
          timestamp: new Date().toISOString(),
          requestId,
          tool: "delete_note",
          durationMs: Date.now() - startTime,
          status: "error",
          error: errMsg,
        });

        return {
          isError: true,
          content: [{ type: "text", text: `Database error saat menghapus catatan: ${errMsg}` }],
        };
      }
    }
  );

  return server;
}

function bearerAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  const token = process.env.MCP_BEARER_TOKEN;
  if (token) {
    const authHeader = req.headers.authorization;
    if (!authHeader || authHeader !== `Bearer ${token}`) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32000, message: "Unauthorized: Token bearer tidak valid atau tidak disertakan" },
        id: null,
      });
      return;
    }
  }
  next();
}

app.get("/health", async (_req: Request, res: Response) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const status = dbOk ? "ok" : "degraded";
  res.status(dbOk ? 200 : 503).json({
    status,
    service: "mcp-notes",
    database: dbOk,
    timestamp: new Date().toISOString(),
  });
});

app.post("/mcp", bearerAuthMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    if (sessionId && sessions.has(sessionId)) {
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, req.body);
      return;
    }

    if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid) => {
          sessions.set(sid, transport);
        },
      });

      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };

      const mcpServer = createMcpServer();
      await mcpServer.connect(transport);
      await transport.handleRequest(req, res, req.body);
      return;
    }

    res.status(400).json({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Bad Request: Sesi tidak valid atau request initialization hilang" },
      id: null,
    });
  } catch (err: unknown) {
    console.error("[mcp-notes] Error handling MCP POST:", err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

app.get("/mcp", bearerAuthMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (!sessionId || !sessions.has(sessionId)) {
    res.status(404).json({
      jsonrpc: "2.0",
      error: { code: -32001, message: "Sesi MCP tidak ditemukan" },
      id: null,
    });
    return;
  }

  await sessions.get(sessionId)!.handleRequest(req, res);
});

app.delete("/mcp", bearerAuthMiddleware, async (req: Request, res: Response) => {
  const sessionId = req.headers["mcp-session-id"] as string | undefined;
  if (sessionId && sessions.has(sessionId)) {
    await sessions.get(sessionId)!.close();
    sessions.delete(sessionId);
  }
  res.status(200).json({ success: true, message: "Sesi MCP berhasil dihentikan" });
});

export async function startServer(portToUse?: number) {
  try {
    await migrate();
    console.log("[mcp-notes] Database migration applied successfully");
  } catch (err) {
    console.error("[mcp-notes] Database migration failed on startup:", err);
  }

  const port = portToUse || process.env.PORT || process.env.MCP_NOTES_PORT || 3001;
  return new Promise<import("http").Server>((resolve) => {
    const server = app.listen(port, () => {
      console.log(`[mcp-notes] Server running on port ${port}`);
      resolve(server);
    });
  });
}

if (process.env.AUTO_START !== "false" && process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("[mcp-notes] Fatal startup error:", err);
    process.exit(1);
  });
}

export default app;
