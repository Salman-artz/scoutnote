import "dotenv/config";

interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
}

interface ChatChoice {
  index: number;
  message: {
    role: string;
    content?: string | null;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

interface ChatCompletionResponse {
  id?: string;
  choices?: ChatChoice[];
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

function sanitizeLog(text: string): string {
  return text
    .replace(/AIza[0-9A-Za-z-_]{35}/g, "[REDACTED_KEY]")
    .replace(/sk-[A-Za-z0-9_-]{20,}/g, "[REDACTED_KEY]");
}

function formatHttpError(status: number, errorData: any): string {
  const errMsg = sanitizeLog(
    typeof errorData === "string"
      ? errorData
      : errorData?.error?.message || JSON.stringify(errorData)
  );

  switch (status) {
    case 400:
      return `[400 Bad Request] Parameter permintaan tidak valid: ${errMsg}`;
    case 401:
      return `[401 Unauthorized] Kunci API tidak valid atau tidak memiliki otorisasi.`;
    case 403:
      return `[403 Forbidden] Akses ditolak atau batasan izin API key: ${errMsg}`;
    case 404:
      return `[404 Not Found] Model tidak ditemukan atau sudah tidak tersedia untuk pengguna baru: ${errMsg}`;
    case 429:
      return `[429 Quota Exceeded / Rate Limit] Batas kuota gratis (RPM/TPM/RPD) terlampaui: ${errMsg}`;
    default:
      return `[HTTP ${status}] ${errMsg}`;
  }
}

async function fetchWithRetry(
  endpoint: string,
  options: RequestInit,
  maxRetries: number = 2
): Promise<Response> {
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(endpoint, options);
    if (res.status === 503 && attempt <= maxRetries) {
      console.warn(`[503 Spike] Server sedang sibuk, mencoba kembali dalam 2 detik (percobaan ${attempt}/${maxRetries})...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
      continue;
    }
    return res;
  }
}

async function testModel(
  model: string,
  baseUrl: string,
  apiKey: string
): Promise<{ passed: boolean; model: string; summary: string }> {
  console.log(`\n========================================`);
  console.log(`Menguji Model: ${model}`);
  console.log(`========================================`);

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const endpoint = `${cleanBase}/chat/completions`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  const mockTool = {
    type: "function",
    function: {
      name: "web_search",
      description: "Mencari informasi berita dan artikel terkini dari web.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Kata kunci pencarian web",
          },
        },
        required: ["query"],
      },
    },
  };

  // --- Putaran 1: Kirim "Cari berita Expo" + tools ---
  console.log(`[Putaran 1] Mengirim pesan: "Cari berita Expo" dengan tool "web_search"...`);
  const t0 = Date.now();

  let res1: Response;
  try {
    res1 = await fetchWithRetry(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Cari berita Expo" }],
        tools: [mockTool],
        tool_choice: "auto",
      }),
    });
  } catch (err: any) {
    const lat = Date.now() - t0;
    console.error(`Status HTTP: Gagal terhubung (${lat}ms)`);
    console.error(`Error koneksi: ${err?.message}`);
    return { passed: false, model, summary: `Gagal koneksi: ${err?.message}` };
  }

  const lat1 = Date.now() - t0;
  console.log(`Status HTTP: ${res1.status} (${lat1}ms)`);

  let data1: any;
  const rawText1 = await res1.text();
  try {
    data1 = JSON.parse(rawText1);
  } catch {
    data1 = rawText1;
  }

  if (!res1.ok) {
    const errorMsg = formatHttpError(res1.status, data1);
    console.error(`Detail Error: ${errorMsg}`);
    return { passed: false, model, summary: `HTTP ${res1.status}: ${errorMsg}` };
  }

  const assistantMsg = data1.choices?.[0]?.message;
  const toolCalls = assistantMsg?.tool_calls;
  const hasToolCalls = Boolean(toolCalls && toolCalls.length > 0);

  console.log(`Respons Memuat tool_calls: ${hasToolCalls ? "Ya" : "Tidak"}`);

  if (!hasToolCalls) {
    console.warn(`Model tidak memanggil tool "web_search", respons langsung berupa teks.`);
    console.log(`Isi Respons: ${assistantMsg?.content || "(kosong)"}`);
    return {
      passed: false,
      model,
      summary: "Model tidak memicu tool calling (merespons teks langsung)",
    };
  }

  const firstCall = toolCalls[0];
  console.log(`Nama Tool Dipanggil: ${firstCall.function.name}`);
  console.log(`Argumen Tool: ${firstCall.function.arguments}`);

  // --- Putaran 2: Kirim hasil tool palsu kembali ---
  console.log(`\n[Putaran 2] Mengirim balik hasil tool palsu dengan role: "tool"...`);
  const mockToolResult =
    "Daftar berita pameran Expo terbaru 2025: Pekan Raya Jakarta (PRJ) dan Indo Defence Expo dijadwalkan kembali digelar tahun ini dengan berbagai partisipan internasional.";

  const messagesTurn2 = [
    { role: "user", content: "Cari berita Expo" },
    assistantMsg,
    {
      role: "tool",
      tool_call_id: firstCall.id,
      content: mockToolResult,
    },
  ];

  const t1 = Date.now();
  let res2: Response;
  try {
    res2 = await fetchWithRetry(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages: messagesTurn2,
      }),
    });
  } catch (err: any) {
    const lat = Date.now() - t1;
    console.error(`Status HTTP Putaran 2: Gagal terhubung (${lat}ms)`);
    console.error(`Error koneksi: ${err?.message}`);
    return { passed: false, model, summary: `Putaran 2 gagal koneksi: ${err?.message}` };
  }

  const lat2 = Date.now() - t1;
  console.log(`Status HTTP Putaran 2: ${res2.status} (${lat2}ms)`);

  let data2: any;
  const rawText2 = await res2.text();
  try {
    data2 = JSON.parse(rawText2);
  } catch {
    data2 = rawText2;
  }

  if (!res2.ok) {
    const errorMsg = formatHttpError(res2.status, data2);
    console.error(`Detail Error Putaran 2: ${errorMsg}`);
    return { passed: false, model, summary: `Putaran 2 HTTP ${res2.status}: ${errorMsg}` };
  }

  const finalContent = data2.choices?.[0]?.message?.content;
  const finalToolCalls = data2.choices?.[0]?.message?.tool_calls;

  if (typeof finalContent === "string" && finalContent.trim().length > 0) {
    console.log(`\nHasil Putaran Lanjutan (Jawaban Akhir Model):`);
    console.log(`----------------------------------------`);
    console.log(finalContent.trim());
    console.log(`----------------------------------------`);
    console.log(`Total Latensi: ${lat1 + lat2}ms (Turn 1: ${lat1}ms, Turn 2: ${lat2}ms)`);
    console.log(`Hasil Evaluasi: LULUS (Mendukung Tool Calling & Multi-turn Tool Reply)`);
    return { passed: true, model, summary: "LULUS (Tool calling & turn lanjutan sukses)" };
  } else if (finalToolCalls && finalToolCalls.length > 0) {
    console.log(`Hasil Putaran Lanjutan: Model meminta tool_call tambahan.`);
    console.log(`Tool tambahan: ${finalToolCalls[0]?.function?.name}`);
    return {
      passed: true,
      model,
      summary: "LULUS (Model melanjutkan reasoning / tool calling)",
    };
  } else {
    console.warn(`Hasil Putaran Lanjutan: Respons tidak memuat teks.`);
    return {
      passed: false,
      model,
      summary: "Putaran 2 berhasil tapi tanpa konten teks",
    };
  }
}

async function main() {
  const apiKey = process.env.LLM_API_KEY?.trim();
  if (!apiKey) {
    console.error("Error: LLM_API_KEY tidak ditemukan di environment atau file .env.");
    process.exit(1);
  }

  const baseUrl =
    process.env.LLM_BASE_URL?.trim() ||
    "https://generativelanguage.googleapis.com/v1beta/openai/";

  console.log(`=== ScoutNote LLM Compatibility & Tool Calling Checker ===`);
  console.log(`Base URL: ${baseUrl}`);

  const cliArgs = process.argv.slice(2);
  let modelsToTest: string[] = [];

  if (cliArgs.length > 0) {
    modelsToTest = cliArgs;
  } else if (process.env.LLM_MODEL?.trim()) {
    modelsToTest = [process.env.LLM_MODEL.trim()];
  } else {
    // Default kandidat model Gemini yang aktif
    modelsToTest = [
      "gemini-2.5-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-flash-lite-latest",
    ];
  }

  console.log(`Daftar Model yang Diuji: ${modelsToTest.join(", ")}`);

  const results: Array<{ passed: boolean; model: string; summary: string }> = [];

  for (const m of modelsToTest) {
    const res = await testModel(m, baseUrl, apiKey);
    results.push(res);
  }

  console.log(`\n========================================`);
  console.log(`RINGKASAN HASIL PENGUJIAN MODEL LLM`);
  console.log(`========================================`);
  for (const r of results) {
    const icon = r.passed ? "[V] LULUS" : "[X] GAGAL";
    console.log(`${icon} | ${r.model.padEnd(25)} | ${r.summary}`);
  }

  const anyPassed = results.some((r) => r.passed);
  if (!anyPassed) {
    process.exitCode = 1;
  }
}

main();
