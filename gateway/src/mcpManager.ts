import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { config } from "./config.js";

export interface UnifiedTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolExecutionOutput {
  server: "read" | "write";
  tool: string;
  status: "success" | "error";
  preview: string;
  fullResult: string;
  durationMs: number;
}

class McpManager {
  private clientA: Client | null = null;
  private clientB: Client | null = null;
  private isConnectedA = false;
  private isConnectedB = false;

  private async getExaClient(): Promise<Client> {
    if (this.clientA && this.isConnectedA) {
      return this.clientA;
    }

    const exaUrl = new URL(config.exa.url);
    if (!exaUrl.searchParams.has("tools")) {
      exaUrl.searchParams.set("tools", "web_search_exa");
    }

    const headers: Record<string, string> = {};
    if (config.exa.apiKey) {
      headers["x-api-key"] = config.exa.apiKey;
      headers["Authorization"] = `Bearer ${config.exa.apiKey}`;
    }

    const transport = new StreamableHTTPClientTransport(exaUrl, {
      requestInit: { headers },
    });

    const client = new Client(
      { name: "gateway-exa-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clientA = client;
    this.isConnectedA = true;
    return client;
  }

  private async getNotesClient(): Promise<Client> {
    if (this.clientB && this.isConnectedB) {
      return this.clientB;
    }

    const headers: Record<string, string> = {};
    if (config.notes.bearerToken) {
      headers["Authorization"] = `Bearer ${config.notes.bearerToken}`;
    }

    const transport = new StreamableHTTPClientTransport(
      new URL(config.notes.url),
      {
        requestInit: { headers },
      }
    );

    const client = new Client(
      { name: "gateway-notes-client", version: "1.0.0" },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clientB = client;
    this.isConnectedB = true;
    return client;
  }

  public async getUnifiedTools(): Promise<UnifiedTool[]> {
    const unified: UnifiedTool[] = [];

    // MCP A (Exa)
    try {
      const clientA = await this.getExaClient();
      const resA = await clientA.listTools();
      for (const t of resA.tools) {
        const cleanName = `exa__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        unified.push({
          type: "function",
          function: {
            name: cleanName,
            description: t.description,
            parameters: (t.inputSchema as Record<string, unknown>) || {
              type: "object",
              properties: {},
            },
          },
        });
      }
    } catch (err) {
      console.error("[gateway] Gagal mengambil tool MCP A (Exa):", err);
      this.isConnectedA = false;
      this.clientA = null;
    }

    // MCP B (Notes)
    try {
      const clientB = await this.getNotesClient();
      const resB = await clientB.listTools();
      for (const t of resB.tools) {
        const cleanName = `notes__${t.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
        unified.push({
          type: "function",
          function: {
            name: cleanName,
            description: t.description,
            parameters: (t.inputSchema as Record<string, unknown>) || {
              type: "object",
              properties: {},
            },
          },
        });
      }
    } catch (err) {
      console.error("[gateway] Gagal mengambil tool MCP B (Notes):", err);
      this.isConnectedB = false;
      this.clientB = null;
    }

    return unified;
  }

  public async executeTool(
    prefixedName: string,
    args: Record<string, unknown>
  ): Promise<ToolExecutionOutput> {
    const startTime = Date.now();
    const timeoutMs = 25000;

    let serverType: "read" | "write" = "read";
    let originalName = prefixedName;
    let isExa = false;

    if (prefixedName.startsWith("exa__")) {
      serverType = "read";
      originalName = prefixedName.replace(/^exa__/, "");
      isExa = true;
    } else if (prefixedName.startsWith("notes__")) {
      serverType = "write";
      originalName = prefixedName.replace(/^notes__/, "");
      isExa = false;
    }

    const runCall = async (): Promise<{ isError: boolean; text: string }> => {
      if (isExa) {
        const client = await this.getExaClient();
        const res = await client.callTool({
          name: originalName,
          arguments: args,
        });
        const isError = Boolean(res.isError);
        const contentList = Array.isArray(res.content) ? res.content : [];
        const text = contentList
          .map((item) =>
            typeof item === "object" && item !== null && "text" in item
              ? String((item as { text: unknown }).text)
              : JSON.stringify(item)
          )
          .join("\n");
        return { isError, text };
      } else {
        const client = await this.getNotesClient();
        const res = await client.callTool({
          name: originalName,
          arguments: args,
        });
        const isError = Boolean(res.isError);
        const contentList = Array.isArray(res.content) ? res.content : [];
        const text = contentList
          .map((item) =>
            typeof item === "object" && item !== null && "text" in item
              ? String((item as { text: unknown }).text)
              : JSON.stringify(item)
          )
          .join("\n");
        return { isError, text };
      }
    };

    const timeoutPromise = new Promise<{ isError: boolean; text: string }>(
      (_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Timeout: Eksekusi tool ${originalName} melebihi batas 25 detik`
              )
            ),
          timeoutMs
        )
    );

    try {
      const { isError, text } = await Promise.race([
        runCall(),
        timeoutPromise,
      ]);
      const durationMs = Date.now() - startTime;

      let finalText = text;
      if (finalText.length > 6000) {
        finalText =
          finalText.slice(0, 6000) +
          "\n... [Hasil dipotong karena melebihi batas 6000 karakter]";
      }

      const preview =
        finalText.length > 200
          ? `${finalText.slice(0, 200)}...`
          : finalText || "(Tidak ada output)";

      return {
        server: serverType,
        tool: originalName,
        status: isError ? "error" : "success",
        preview,
        fullResult: finalText,
        durationMs,
      };
    } catch (err: unknown) {
      const durationMs = Date.now() - startTime;
      const errMsg = err instanceof Error ? err.message : String(err);

      if (isExa) {
        this.isConnectedA = false;
        this.clientA = null;
      } else {
        this.isConnectedB = false;
        this.clientB = null;
      }

      return {
        server: serverType,
        tool: originalName,
        status: "error",
        preview: `Error: ${errMsg}`,
        fullResult: `Error: ${errMsg}`,
        durationMs,
      };
    }
  }

  public async checkHealth(): Promise<{ mcp_a: boolean; mcp_b: boolean }> {
    let mcp_a = false;
    let mcp_b = false;

    try {
      const clientA = await this.getExaClient();
      await clientA.listTools();
      mcp_a = true;
    } catch {
      mcp_a = false;
    }

    try {
      const notesHealthUrl = new URL(config.notes.url);
      notesHealthUrl.pathname = "/health";
      const res = await fetch(notesHealthUrl.toString(), {
        signal: AbortSignal.timeout(3000),
      });
      mcp_b = res.ok;
    } catch {
      try {
        const clientB = await this.getNotesClient();
        await clientB.listTools();
        mcp_b = true;
      } catch {
        mcp_b = false;
      }
    }

    return { mcp_a, mcp_b };
  }
}

export const mcpManager = new McpManager();
