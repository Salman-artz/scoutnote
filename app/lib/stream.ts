export type StreamEvent = { event: string; data: Record<string, unknown> };

export async function streamChat(
  baseUrl: string,
  messages: Array<{ role: string; content: string }>,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify({ messages }), signal });
  if (!response.ok || !response.body) throw new Error(`Gateway tidak terjangkau (HTTP ${response.status})`);
  const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffer = ""; let event = "message";
  let reading = true;
  while (reading) {
    const chunk = await reader.read(); if (chunk.done) { reading = false; break; }
    buffer += decoder.decode(chunk.value, { stream: true }); const lines = buffer.split("\n"); buffer = lines.pop() || "";
    for (const line of lines) { const value = line.trim(); if (value.startsWith("event: ")) event = value.slice(7); if (value.startsWith("data: ")) { try { onEvent({ event, data: JSON.parse(value.slice(6)) }); } catch { /* ignore incomplete SSE data */ } } }
  }
}
