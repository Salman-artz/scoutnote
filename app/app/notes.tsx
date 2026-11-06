import { useCallback, useEffect, useState } from "react";
import { Alert, FlatList, RefreshControl, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { NoteCard } from "../components/NoteCard";
import { useTheme } from "../theme/ThemeContext";

type Note = { id: number; title: string; content: string; source_url?: string | null; created_at: string };
const apiUrl = () => process.env.EXPO_PUBLIC_API_URL?.trim() || "";

export default function NotesScreen() {
  const { tokens, isDark } = useTheme(); const [notes, setNotes] = useState<Note[]>([]); const [refreshing, setRefreshing] = useState(false); const [error, setError] = useState("");
  const load = useCallback(async () => { if (!apiUrl()) { setError("URL gateway belum dikonfigurasi. Isi EXPO_PUBLIC_API_URL di app/.env."); return; } setRefreshing(true); setError(""); try { const response = await fetch(`${apiUrl().replace(/\/$/, "")}/notes`); if (!response.ok) throw new Error(`Gagal mengambil catatan (HTTP ${response.status})`); const data = await response.json() as { notes?: Note[] }; setNotes(data.notes || []); } catch (err) { setError(err instanceof Error ? err.message : "Gateway tidak terjangkau."); } finally { setRefreshing(false); } }, []);
  useEffect(() => { void load(); }, [load]);
  const confirmDelete = (id: number) => Alert.alert("Hapus catatan?", "Catatan ini akan dihapus permanen.", [{ text: "Batal", style: "cancel" }, { text: "Hapus", style: "destructive", onPress: () => void deleteNote(id) }]);
  const deleteNote = async (id: number) => { if (!apiUrl()) return; try { const response = await fetch(`${apiUrl().replace(/\/$/, "")}/notes/${id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Catatan gagal dihapus."); setNotes((current) => current.filter((note) => note.id !== id)); } catch (err) { setError(err instanceof Error ? err.message : "Catatan gagal dihapus."); } };
  return <SafeAreaView style={[styles.safe, { backgroundColor: tokens.background }]}><StatusBar style={isDark ? "light" : "dark"} /><View style={styles.header}><Text style={[styles.title, { color: tokens.text }]}>Notes</Text><Text style={{ color: tokens.muted }}>{notes.length} catatan</Text></View>{error ? <ErrorBanner message={error} onRetry={() => void load()} onDismiss={() => setError("")} /> : null}<FlatList data={notes} keyExtractor={(note) => String(note.id)} renderItem={({ item }) => <NoteCard note={item} onDelete={confirmDelete} />} contentContainerStyle={notes.length ? styles.list : styles.empty} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load()} tintColor={tokens.primary} />} ListEmptyComponent={!refreshing ? <EmptyState title="Belum ada catatan" description="Catatan yang berhasil disimpan dari Chat akan tampil di sini." /> : null} /></SafeAreaView>;
}
const styles = StyleSheet.create({ safe: { flex: 1 }, header: { padding: 16, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, title: { fontSize: 24, fontWeight: "700" }, list: { paddingHorizontal: 16, paddingBottom: 16 }, empty: { flexGrow: 1, justifyContent: "center", padding: 16 } });
