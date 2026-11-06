import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, SafeAreaView, ScrollView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { ChatInput } from "../components/ChatInput";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { ExampleChip } from "../components/ExampleChip";
import { MessageBubble } from "../components/MessageBubble";
import { ToolCallCard } from "../components/ToolCallCard";
import { TypingIndicator } from "../components/TypingIndicator";
import { useTheme } from "../theme/ThemeContext";
import { streamChat, StreamEvent } from "../lib/stream";

const DEMO_PROMPT = "Cari berita terbaru tentang Expo React Native lalu simpan ringkasannya sebagai catatan";
const EXAMPLES = [DEMO_PROMPT, "Cari update terbaru React Native", "Buat catatan dari berita teknologi hari ini"];
type Tool = { id: string; server: "read" | "write"; name: string; args: Record<string, unknown>; status: "running" | "success" | "error"; preview?: string };
type Message = { id: string; role: "user" | "assistant"; content: string; tools?: Tool[] };

function apiUrl() { return process.env.EXPO_PUBLIC_API_URL?.trim() || ""; }

export default function ChatScreen() {
  const { tokens, isDark, toggleTheme } = useTheme();
  const [messages, setMessages] = useState<Message[]>([]); const [input, setInput] = useState(""); const [loading, setLoading] = useState(false); const [error, setError] = useState(""); const [retryPrompt, setRetryPrompt] = useState("");
  const send = useCallback(async (prompt = input) => { const text = prompt.trim(); if (!text || loading) return; const user: Message = { id: `${Date.now()}-u`, role: "user", content: text }; const assistantId = `${Date.now()}-a`; setInput(""); setRetryPrompt(text); setLoading(true); setError(""); setMessages((prev) => [...prev, user, { id: assistantId, role: "assistant", content: "", tools: [] }]);
    try { if (!apiUrl()) throw new Error("URL gateway belum dikonfigurasi. Isi EXPO_PUBLIC_API_URL di app/.env."); await streamChat(apiUrl(), [...messages.filter((m) => m.role !== "assistant" || m.content).map((m) => ({ role: m.role, content: m.content })), { role: "user", content: text }], (event: StreamEvent) => { setMessages((prev) => prev.map((m) => { if (m.id !== assistantId) return m; if (event.event === "token") return { ...m, content: `${m.content}${String(event.data.delta || "")}` }; if (event.event === "tool_call") { const d = event.data; const tool: Tool = { id: String(d.id), server: d.server === "write" ? "write" : "read", name: String(d.tool || ""), args: (d.input as Record<string, unknown>) || {}, status: "running" }; return { ...m, tools: [...(m.tools || []), tool] }; } if (event.event === "tool_result") { const d = event.data; return { ...m, tools: (m.tools || []).map((t) => t.id === String(d.id) ? { ...t, status: d.status === "success" ? "success" : "error", preview: String(d.preview || "") } : t) }; } if (event.event === "error") { setError(String(event.data.message || "Gateway gagal memproses permintaan.")); } return m; })); }); } catch (err) { setError(err instanceof Error ? err.message : "Gateway tidak terjangkau."); } finally { setLoading(false); }
  }, [input, loading, messages]);
  const renderMessage = useMemo(() => ({ item }: { item: Message }) => <MessageBubble role={item.role} content={item.content}>{item.tools?.map((tool) => <ToolCallCard key={tool.id} serverType={tool.server} toolName={tool.name} status={tool.status} argumentsPayload={tool.args} resultPreview={tool.preview} />)}</MessageBubble>, []);
  return <SafeAreaView style={[styles.safe, { backgroundColor: tokens.background }]}><StatusBar style={isDark ? "light" : "dark"} /><View style={styles.header}><View><Text style={[styles.title, { color: tokens.text }]}>ScoutNote</Text><Text style={{ color: tokens.muted }}>Riset web, simpan catatan.</Text></View><Text onPress={toggleTheme} style={[styles.theme, { color: tokens.primary }]}>{isDark ? "Light" : "Dark"}</Text></View>{error ? <ErrorBanner message={error} onRetry={() => send(retryPrompt)} onDismiss={() => setError("")} /> : null}<FlatList data={messages} keyExtractor={(m) => m.id} renderItem={renderMessage} contentContainerStyle={messages.length ? styles.list : styles.emptyList} ListEmptyComponent={<View><EmptyState title="Mulai riset dengan ScoutNote" description="Pilih contoh prompt atau tulis pertanyaan Anda." />{EXAMPLES.map((example) => <ExampleChip key={example} label={example} onPress={(p) => send(p)} />)}</View>} ListFooterComponent={loading ? <TypingIndicator /> : null} /><KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>{messages.length ? EXAMPLES.map((example) => <ExampleChip key={example} label={example} onPress={(p) => send(p)} />) : null}</ScrollView><ChatInput value={input} onChangeText={setInput} onSend={() => send()} isLoading={loading} /></KeyboardAvoidingView>{loading ? <ActivityIndicator color={tokens.primary} style={styles.loader} /> : null}</SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, header: { paddingHorizontal: 16, paddingVertical: 14, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { fontSize: 24, fontWeight: "700" }, theme: { padding: 8 }, list: { padding: 16, paddingTop: 4 }, emptyList: { flexGrow: 1, justifyContent: "center", padding: 16 }, chips: { paddingHorizontal: 16, paddingBottom: 4 }, loader: { position: "absolute", top: 18, right: 18 } });
