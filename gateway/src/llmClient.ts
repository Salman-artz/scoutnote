import { config } from "./config.js";
import { UnifiedTool } from "./mcpManager.js";

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | null;
  tool_calls?: ToolCallItem[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolCallItem {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
  extra_content?: unknown;
  [key: string]: unknown;
}

export interface LLMIterationResult {
  text: string;
  toolCalls: ToolCallItem[];
  finishReason: string;
}

export async function completeChatNonStreaming(
  messages: ChatMessage[],
  tools: UnifiedTool[]
): Promise<LLMIterationResult> {
  const url = `${config.llm.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages,
    stream: false,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM Error HTTP ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string; tool_calls?: ToolCallItem[] };
      finish_reason?: string;
    }>;
  };
  const choice = data.choices?.[0];
  const msg = choice?.message || {};

  return {
    text: msg.content || "",
    toolCalls: msg.tool_calls || [],
    finishReason: choice?.finish_reason || "stop",
  };
}

export async function* streamChat(
  messages: ChatMessage[],
  tools: UnifiedTool[]
): AsyncGenerator<
  | { type: "token"; delta: string }
  | { type: "tool_call_delta"; index: number; id?: string; name?: string; argsDelta?: string }
  | { type: "done"; finishReason: string },
  LLMIterationResult,
  unknown
> {
  const url = `${config.llm.baseUrl}/chat/completions`;

  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages,
    stream: true,
  };

  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const errText = await res.text();
    throw new Error(`LLM Stream Error HTTP ${res.status}: ${errText}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let fullText = "";
  const toolCallsMap = new Map<
    number,
    { id: string; name: string; args: string; extra_content?: unknown }
  >();
  let finalFinishReason = "stop";

  try {
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
        if (!trimmed || trimmed.startsWith(":")) continue;

        if (trimmed.startsWith("data: ")) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr === "[DONE]") {
            yield { type: "done", finishReason: finalFinishReason };
            continue;
          }

          try {
            const parsed = JSON.parse(jsonStr);
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            if (choice.finish_reason) {
              finalFinishReason = choice.finish_reason;
            }

            const delta = choice.delta;
            if (!delta) continue;

            if (delta.content) {
              fullText += delta.content;
              yield { type: "token", delta: delta.content };
            }

            if (Array.isArray(delta.tool_calls)) {
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                let existing = toolCallsMap.get(idx);
                if (!existing) {
                  existing = {
                    id: tc.id || `call_${Date.now()}_${idx}`,
                    name: "",
                    args: "",
                  };
                  toolCallsMap.set(idx, existing);
                }
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name += tc.function.name;
                if (tc.function?.arguments) existing.args += tc.function.arguments;
                if (tc.extra_content) existing.extra_content = tc.extra_content;

                yield {
                  type: "tool_call_delta",
                  index: idx,
                  id: tc.id,
                  name: tc.function?.name,
                  argsDelta: tc.function?.arguments,
                };
              }
            }
          } catch {
            // Ignore malformed chunk
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  const finalToolCalls: ToolCallItem[] = Array.from(toolCallsMap.values()).map(
    (tc) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: tc.args,
      },
      ...(tc.extra_content !== undefined
        ? { extra_content: tc.extra_content }
        : {}),
    })
  );

  return {
    text: fullText,
    toolCalls: finalToolCalls,
    finishReason: finalFinishReason,
  };
}
