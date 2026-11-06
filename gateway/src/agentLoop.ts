import { Response } from "express";
import { randomUUID } from "node:crypto";
import { mcpManager } from "./mcpManager.js";
import {
  ChatMessage,
  streamChat,
  completeChatNonStreaming,
  LLMIterationResult,
} from "./llmClient.js";

const SYSTEM_PROMPT =
  "Gunakan tool Exa untuk mencari informasi terbaru di web. Setelah menemukan informasi yang relevan, panggil notes__save_note untuk menyimpan catatan dengan ringkasan singkat dan URL sumber. Jangan pernah menyatakan catatan tersimpan kecuali tool berhasil.";

const MAX_ITERATIONS = 6;

function sendSSE(res: Response, event: string, data: Record<string, unknown>) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function logToolEvent(entry: {
  timestamp: string;
  requestId: string;
  tool: string;
  server: "read" | "write";
  durationMs: number;
  status: "success" | "error";
}) {
  console.log(JSON.stringify(entry));
}

export async function runAgentLoop(
  userMessages: ChatMessage[],
  res: Response
): Promise<void> {
  const requestId = randomUUID();
  const executedCalls = new Map<string, string>();

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    ...userMessages,
  ];

  let iteration = 0;

  try {
    const tools = await mcpManager.getUnifiedTools();

    while (iteration < MAX_ITERATIONS) {
      iteration++;

      let iterResult: LLMIterationResult = {
        text: "",
        toolCalls: [],
        finishReason: "stop",
      };

      try {
        const streamGen = streamChat(messages, tools);
        let streamDone = false;
        while (!streamDone) {
          const next = await streamGen.next();
          if (next.done) {
            iterResult = next.value;
            streamDone = true;
            break;
          }
          const item = next.value;
          if (item.type === "token") {
            sendSSE(res, "token", { delta: item.delta });
          }
        }
      } catch (streamErr) {
        console.warn(
          `[gateway] LLM streaming gagal pada iterasi ${iteration}, fallback ke non-streaming:`,
          streamErr
        );
        iterResult = await completeChatNonStreaming(messages, tools);
        if (iterResult.text) {
          sendSSE(res, "token", { delta: iterResult.text });
        }
      }

      const hasToolCalls =
        iterResult.toolCalls && iterResult.toolCalls.length > 0;

      // Append assistant response to message history
      messages.push({
        role: "assistant",
        content: iterResult.text || null,
        tool_calls: hasToolCalls ? iterResult.toolCalls : undefined,
      });

      if (!hasToolCalls) {
        // No further tools needed, finished
        sendSSE(res, "done", {
          finish_reason: iterResult.finishReason || "stop",
          message_id: `msg_${Date.now()}`,
        });
        res.end();
        return;
      }

      // Execute each tool call
      for (const tc of iterResult.toolCalls) {
        const toolName = tc.function.name;
        let args: Record<string, unknown> = {};
        try {
          args = tc.function.arguments
            ? JSON.parse(tc.function.arguments)
            : {};
        } catch {
          args = {};
        }

        const serverType = toolName.startsWith("notes__") ? "write" : "read";
        const cleanToolName = toolName
          .replace(/^exa__/, "")
          .replace(/^notes__/, "");

        sendSSE(res, "tool_call", {
          id: tc.id,
          server: serverType,
          tool: cleanToolName,
          input: args,
        });

        // Duplicate call detection
        const callSignature = `${toolName}:${JSON.stringify(args)}`;
        let toolOutput: {
          server: "read" | "write";
          tool: string;
          status: "success" | "error";
          preview: string;
          fullResult: string;
          durationMs: number;
        };

        if (executedCalls.has(callSignature)) {
          const prevResult = executedCalls.get(callSignature)!;
          toolOutput = {
            server: serverType,
            tool: cleanToolName,
            status: "success",
            preview: "(Pemanggilan tool duplikat terdeteksi, menggunakan hasil sebelumnya)",
            fullResult: prevResult,
            durationMs: 0,
          };
        } else {
          toolOutput = await mcpManager.executeTool(toolName, args);
          if (toolOutput.status === "success") {
            executedCalls.set(callSignature, toolOutput.fullResult);
          }
        }

        logToolEvent({
          timestamp: new Date().toISOString(),
          requestId,
          tool: toolOutput.tool,
          server: toolOutput.server,
          durationMs: toolOutput.durationMs,
          status: toolOutput.status,
        });

        sendSSE(res, "tool_result", {
          id: tc.id,
          server: toolOutput.server,
          tool: toolOutput.tool,
          status: toolOutput.status,
          preview: toolOutput.preview,
        });

        // Add tool output back to conversation context
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          name: toolName,
          content: toolOutput.fullResult,
        });
      }
    }

    // Exceeded maximum iterations
    sendSSE(res, "done", {
      finish_reason: "length",
      message_id: `msg_limit_${Date.now()}`,
    });
    res.end();
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error("[gateway] Error in agent loop:", err);
    sendSSE(res, "error", {
      code: "INTERNAL_ERROR",
      message: `Terjadi kesalahan saat memproses obrolan: ${errMsg}`,
    });
    res.end();
  }
}
