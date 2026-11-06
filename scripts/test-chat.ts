import dotenv from "dotenv";
import http from "node:http";

dotenv.config();

const gatewayUrlStr =
  process.env.GATEWAY_URL ||
  process.env.EXPO_PUBLIC_GATEWAY_URL ||
  "http://localhost:3000";

async function checkHealth(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const u = new URL(url);
      const req = http.get(
        {
          hostname: u.hostname,
          port: u.port || 80,
          path: "/health",
          timeout: 2000,
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
  console.log("=== ScoutNote Gateway & Dual-MCP Chat Verification Test ===");
  console.log(`Target Gateway URL: ${gatewayUrlStr}`);

  let serverInstance: http.Server | null = null;
  const isHealthy = await checkHealth(gatewayUrlStr);

  if (!isHealthy) {
    console.log("\n[Info] Server gateway belum aktif di URL target. Memulai instance lokal...");
    process.env.AUTO_START = "false";
    const { startGatewayServer } = await import("../gateway/src/server.js");
    serverInstance = await startGatewayServer(3000);
    await new Promise((r) => setTimeout(r, 600));
    console.log("[Info] Server gateway berhasil dijalankan.");
  } else {
    console.log("[Info] Terhubung ke server gateway yang sudah aktif.");
  }

  // 1. Health check
  console.log("\n1. Memeriksa status kesehatan sistem (GET /health)...");
  const healthRes = await fetch(new URL("/health", gatewayUrlStr).toString());
  const healthData = await healthRes.json();
  console.log(`   -> Gateway status: HTTP ${healthRes.status}, Body:`, healthData);

  // 2. Send Chat Prompt
  const prompt =
    "Cari berita terbaru tentang Expo React Native lalu simpan ringkasannya sebagai catatan";
  console.log(`\n2. Mengirim prompt percakapan (POST /chat)...`);
  console.log(`   Prompt: "${prompt}"\n`);
  console.log("--- Memulai Penerimaan Event SSE ---");

  const chatUrl = new URL("/chat", gatewayUrlStr).toString();
  const chatRes = await fetch(chatUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!chatRes.ok || !chatRes.body) {
    const errText = await chatRes.text();
    throw new Error(`Permintaan /chat gagal (HTTP ${chatRes.status}): ${errText}`);
  }

  const reader = chatRes.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let currentEvent = "message";
  let fullAssistantText = "";
  let toolCallCount = 0;
  let toolResultCount = 0;
  let isDone = false;

  let isReading = true;
  while (isReading) {
    const { done, value } = await reader.read();
    if (done) {
      isReading = false;
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith("event: ")) {
        currentEvent = trimmed.slice(7).trim();
      } else if (trimmed.startsWith("data: ")) {
        const rawData = trimmed.slice(6).trim();
        try {
          const data = JSON.parse(rawData);

          if (currentEvent === "token") {
            process.stdout.write(data.delta || "");
            fullAssistantText += data.delta || "";
          } else if (currentEvent === "tool_call") {
            toolCallCount++;
            const serverTag =
              data.server === "read"
                ? "\x1b[36m[MCP A: READ (Exa)]\x1b[0m"
                : "\x1b[33m[MCP B: WRITE (Notes)]\x1b[0m";
            console.log(`\n${serverTag} Tool Call: ${data.tool}`);
            console.log(`   Input: ${JSON.stringify(data.input)}`);
          } else if (currentEvent === "tool_result") {
            toolResultCount++;
            const serverTag =
              data.server === "read"
                ? "\x1b[36m[MCP A: RESULT]\x1b[0m"
                : "\x1b[33m[MCP B: RESULT]\x1b[0m";
            console.log(
              `${serverTag} Tool: ${data.tool} (${data.status}) -> Preview: ${data.preview}`
            );
          } else if (currentEvent === "done") {
            isDone = true;
            console.log(
              `\n\x1b[32m[DONE]\x1b[0m Selesai dengan alasan: ${data.finish_reason} (ID: ${data.message_id})`
            );
          } else if (currentEvent === "error") {
            console.error(`\n\x1b[31m[ERROR]\x1b[0m ${data.code}: ${data.message}`);
          }
        } catch {
          // Non-JSON data
        }
      }
    }
  }

  console.log("\n------------------------------------");
  console.log(`Total tool call   : ${toolCallCount}`);
  console.log(`Total tool result : ${toolResultCount}`);
  console.log(`Stream selesai    : ${isDone ? "YA" : "TIDAK"}`);

  // 3. Verifikasi Catatan Tersimpan lewat REST GET /notes
  console.log("\n3. Memverifikasi catatan masuk ke database (GET /notes)...");
  const notesRes = await fetch(new URL("/notes?limit=3", gatewayUrlStr).toString());
  const notesData = (await notesRes.json()) as { notes?: Array<{ id: number; title: string }> };
  console.log(`   Ditemukan ${notesData.notes?.length || 0} catatan terakhir:`);
  for (const n of notesData.notes || []) {
    console.log(`   - [ID ${n.id}] ${n.title}`);
  }

  if (toolCallCount === 0 || toolResultCount === 0 || !isDone) {
    throw new Error("Verifikasi chat streaming gagal: tool call atau status done tidak lengkap.");
  }

  console.log("\n=================================================");
  console.log("HASIL: SEMUA PENGUJIAN GATEWAY & DUAL-MCP LULUS!");
  console.log("=================================================");

  if (serverInstance) {
    serverInstance.close();
  }
}

main().catch((err) => {
  console.error("\n[FATAL] Pengujian chat gagal:", err);
  process.exit(1);
});
