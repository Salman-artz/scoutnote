import "dotenv/config";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
  StreamableHTTPError,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";

async function main() {
  const rawUrl = process.env.EXA_MCP_URL || "https://mcp.exa.ai/mcp";
  const endpoint = new URL(rawUrl);
  endpoint.searchParams.set("tools", "web_search_exa");

  const apiKey = process.env.EXA_API_KEY?.trim();
  const headers: Record<string, string> = {};

  if (apiKey) {
    headers["x-api-key"] = apiKey;
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  const timeoutMs = 30000;
  const timeoutController = new AbortController();
  const timeoutTimer = setTimeout(() => {
    timeoutController.abort(new Error("TIMEOUT"));
  }, timeoutMs);

  const transport = new StreamableHTTPClientTransport(endpoint, {
    requestInit: {
      headers,
      signal: timeoutController.signal,
    },
  });

  const client = new Client(
    {
      name: "scoutnote-exa-client",
      version: "1.0.0",
    },
    {
      capabilities: {},
    }
  );

  try {
    console.log(`Menghubungkan ke ${endpoint.origin}${endpoint.pathname}?tools=web_search_exa...`);
    await client.connect(transport);

    console.log("\n--- Daftar Tool yang Tersedia ---");
    const { tools } = await client.listTools();
    if (!tools || tools.length === 0) {
      console.log("(Tidak ada tool yang terdaftar)");
    } else {
      for (const tool of tools) {
        console.log(`- ${tool.name}: ${tool.description || "(tanpa deskripsi)"}`);
      }
    }

    const query = "Expo React Native latest news";
    console.log(`\nMemanggil web_search_exa dengan query: "${query}"...`);

    const result = await client.callTool({
      name: "web_search_exa",
      arguments: { query },
    });

    let contentText = "";
    if (Array.isArray(result.content)) {
      contentText = result.content
        .map((item: any) => (item.type === "text" ? item.text : JSON.stringify(item)))
        .join("\n");
    } else {
      contentText = JSON.stringify(result);
    }

    console.log("\n--- 500 Karakter Pertama Hasil ---");
    console.log(contentText.slice(0, 500));
    console.log("\n--- Ringkasan Panjang Konten ---");
    console.log(`Total karakter: ${contentText.length}`);
  } catch (err: any) {
    const isTimeout =
      err?.message === "TIMEOUT" ||
      err?.name === "TimeoutError" ||
      timeoutController.signal.aborted;

    if (isTimeout) {
      console.error(`\n[ERROR TIMEOUT]: Koneksi ke server Exa MCP melebihi batas waktu (${timeoutMs / 1000} detik).`);
    } else if (err instanceof StreamableHTTPError || err?.code || err?.status) {
      const code = err.code || err.status;
      if (code === 401) {
        console.error("\n[ERROR 401 Unauthorized]: Kunci autentikasi EXA_API_KEY tidak valid atau otorisasi ditolak.");
      } else if (code === 429) {
        console.error("\n[ERROR 429 Rate Limit]: Batas kuota request Exa terlampaui. Gunakan API key terdaftar atau tunggu beberapa saat.");
      } else {
        console.error(`\n[ERROR HTTP ${code}]: ${err.message}`);
      }
    } else {
      const message = String(err?.message || err);
      if (message.includes("401")) {
        console.error("\n[ERROR 401 Unauthorized]: Kunci autentikasi EXA_API_KEY tidak valid atau otorisasi ditolak.");
      } else if (message.includes("429")) {
        console.error("\n[ERROR 429 Rate Limit]: Batas kuota request Exa terlampaui.");
      } else {
        console.error(`\n[ERROR MCP]: ${message}`);
      }
    }
    process.exitCode = 1;
  } finally {
    clearTimeout(timeoutTimer);
    await client.close().catch(() => {});
  }
}

main();
