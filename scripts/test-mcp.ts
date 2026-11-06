import dotenv from "dotenv";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import http from "node:http";

dotenv.config();

process.env.AUTO_START = "false";

const mcpUrlStr = process.env.MCP_URL || "http://localhost:3001/mcp";
const bearerToken = process.env.MCP_BEARER_TOKEN;

async function checkHealth(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: "/health",
          timeout: 1500,
        },
        (res) => {
          resolve(res.statusCode === 200);
        }
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });
}

async function main() {
  console.log("=== ScoutNote MCP B (Notes) Verification Test ===");
  console.log(`Target MCP URL : ${mcpUrlStr}`);
  console.log(`Auth Bearer    : ${bearerToken ? "Terkonfigurasi (Bearer ***)" : "Tidak ada (Development)"}`);

  let serverInstance: http.Server | null = null;
  const isHealthy = await checkHealth(mcpUrlStr);

  if (!isHealthy) {
    console.log("\n[Info] Server mcp-notes belum aktif. Memulai instance lokal sementara...");
    const { startServer } = await import("../mcp-notes/src/server.js");
    serverInstance = await startServer(3001);
    await new Promise((r) => setTimeout(r, 500));
    console.log("[Info] Server mcp-notes berhasil dijalankan.");
  } else {
    console.log("[Info] Terhubung ke server mcp-notes yang sudah aktif.");
  }

  const client = new Client(
    { name: "scoutnote-test-mcp-client", version: "1.0.0" },
    { capabilities: {} }
  );

  const transport = new StreamableHTTPClientTransport(new URL(mcpUrlStr), {
    requestInit: {
      headers: bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {},
    },
  });

  try {
    console.log("\n1. Menguji proteksi endpoint MCP (Bearer Token)...");
    if (bearerToken) {
      const unauthorizedRes = await fetch(mcpUrlStr, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });
      console.log(`   -> Request tanpa token ditolak: HTTP ${unauthorizedRes.status} (diharapkan 401)`);
      if (unauthorizedRes.status !== 401) {
        throw new Error(`Diharapkan HTTP 401 Unauthorized, didapat: ${unauthorizedRes.status}`);
      }
    } else {
      console.log("   -> MCP_BEARER_TOKEN kosong, proteksi dilewati.");
    }

    console.log("\n2. Menghubungkan client MCP via Streamable HTTP (dengan Bearer Auth)...");
    await client.connect(transport);
    console.log("   -> Terkoneksi ke MCP server.");

    console.log("\n3. Menguji endpoint GET /health...");
    const healthUrl = new URL("/health", mcpUrlStr).toString();
    const healthRes = await fetch(healthUrl);
    const healthData = await healthRes.json();
    console.log(`   -> Health Status: HTTP ${healthRes.status}, Body: ${JSON.stringify(healthData)}`);
    if (healthRes.status !== 200 || !healthData.database) {
      throw new Error(`Endpoint health gagal atau database tidak terhubung: ${JSON.stringify(healthData)}`);
    }

    console.log("\n4. Mengambil daftar tool (list_tools)...");
    const { tools } = await client.listTools();
    const toolNames = tools.map((t) => t.name);
    console.log(`   -> Ditemukan ${tools.length} tool: [${toolNames.join(", ")}]`);

    const requiredTools = ["save_note", "list_notes", "delete_note"];
    for (const reqTool of requiredTools) {
      if (!toolNames.includes(reqTool)) {
        throw new Error(`Tool yang diwajibkan tidak ditemukan: ${reqTool}`);
      }
    }
    console.log("   -> Seluruh tool wajib MCP B terverifikasi.");

    console.log("\n5. Menguji tool save_note...");
    const testTitle = `Catatan Uji MCP - ${Date.now()}`;
    const testContent = "Ringkasan informasi dari Exa Search untuk diuji coba di MCP Notes.";
    const testUrl = "https://example.com/berita-terbaru";

    const saveResult = await client.callTool({
      name: "save_note",
      arguments: {
        title: testTitle,
        content: testContent,
        source_url: testUrl,
      },
    });

    if (saveResult.isError) {
      throw new Error(`save_note gagal: ${JSON.stringify(saveResult.content)}`);
    }

    const firstContent = saveResult.content[0];
    const textData = firstContent && firstContent.type === "text" ? firstContent.text : "";
    const createdNote = JSON.parse(textData);
    console.log(`   -> Catatan berhasil disimpan! ID: ${createdNote.id}, Title: "${createdNote.title}"`);
    console.log(`   -> Source URL: ${createdNote.source_url}, Created At: ${createdNote.created_at}`);

    console.log("\n6. Menguji tool list_notes...");
    const listResult = await client.callTool({
      name: "list_notes",
      arguments: { limit: 5 },
    });

    if (listResult.isError) {
      throw new Error(`list_notes gagal: ${JSON.stringify(listResult.content)}`);
    }

    const listContent = listResult.content[0];
    const listText = listContent && listContent.type === "text" ? listContent.text : "[]";
    const notesList = JSON.parse(listText);
    const found = notesList.some((n: { id: number }) => n.id === createdNote.id);
    console.log(`   -> Berhasil mengambil ${notesList.length} catatan.`);
    console.log(`   -> Keberadaan catatan baru di daftar: ${found ? "TERVERIFIKASI" : "TIDAK DITEMUKAN"}`);
    if (!found) {
      throw new Error("Catatan yang baru dibuat tidak ditemukan dalam list_notes.");
    }

    console.log("\n7. Menguji tool delete_note...");
    const deleteResult = await client.callTool({
      name: "delete_note",
      arguments: { id: createdNote.id },
    });

    if (deleteResult.isError) {
      throw new Error(`delete_note gagal: ${JSON.stringify(deleteResult.content)}`);
    }

    const delContent = deleteResult.content[0];
    const delText = delContent && delContent.type === "text" ? delContent.text : "";
    console.log(`   -> Respon hapus: ${delText}`);

    console.log("\n8. Menguji penanganan error (isError) saat menghapus ID yang tidak ada...");
    const deleteNotFoundResult = await client.callTool({
      name: "delete_note",
      arguments: { id: createdNote.id },
    });

    if (deleteNotFoundResult.isError) {
      const errContent = deleteNotFoundResult.content[0];
      const errText = errContent && errContent.type === "text" ? errContent.text : "";
      console.log(`   -> Error tertangkap dengan benar (isError: true): "${errText}"`);
    } else {
      throw new Error("Diharapkan isError: true untuk penghapusan ID yang tidak ada.");
    }

    console.log("\n9. Menguji penanganan error validasi Zod (judul kosong)...");
    const invalidSaveResult = await client.callTool({
      name: "save_note",
      arguments: {
        title: "",
        content: "Konten tanpa judul",
      },
    });

    if (invalidSaveResult.isError) {
      const errContent = invalidSaveResult.content[0];
      const errText = errContent && errContent.type === "text" ? errContent.text : "";
      console.log(`   -> Validasi Zod tertangkap dengan benar (isError: true): "${errText}"`);
    } else {
      throw new Error("Diharapkan isError: true untuk input judul kosong.");
    }

    console.log("\n=================================================");
    console.log("HASIL: SEMUA PENGUJIAN TOOL MCP B LULUS (100% OK)");
    console.log("=================================================");
  } finally {
    try {
      await client.close();
    } catch {
      // ignore
    }
    if (serverInstance) {
      console.log("\n[Cleanup] Menutup server lokal sementara...");
      await new Promise<void>((resolve) => {
        serverInstance!.close(() => resolve());
      });
      const { pool } = await import("../mcp-notes/src/db.js");
      await pool.end();
    }
  }
}

main().catch((err) => {
  console.error("\n[FATAL] Pengujian MCP gagal:", err);
  process.exit(1);
});
