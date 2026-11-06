import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

export function NoteCard({ note, onDelete }: { note: { id: number; title: string; content: string; source_url?: string | null; created_at: string }; onDelete: (id: number) => void }) {
  const { tokens } = useTheme();
  return <View style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.border }]}>
    <Text style={[styles.title, { color: tokens.text }]}>{note.title}</Text>
    <Text numberOfLines={3} style={[styles.content, { color: tokens.muted }]}>{note.content}</Text>
    <View style={styles.footer}>
      <View style={{ flex: 1 }}>{note.source_url ? <Text numberOfLines={1} onPress={() => Linking.openURL(note.source_url!)} style={[styles.link, { color: tokens.primary }]}>{note.source_url}</Text> : null}<Text style={[styles.date, { color: tokens.muted }]}>{new Date(note.created_at).toLocaleString()}</Text></View>
      <Pressable accessibilityRole="button" onPress={() => onDelete(note.id)}><Text style={[styles.delete, { color: tokens.danger }]}>Hapus</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({ card: { borderWidth: 1, borderRadius: 12, padding: 16, marginVertical: 6 }, title: { fontSize: 17, fontWeight: "600" }, content: { fontSize: 14, lineHeight: 20, marginTop: 8 }, footer: { flexDirection: "row", alignItems: "center", marginTop: 12, gap: 12 }, link: { fontSize: 12 }, date: { fontSize: 11, marginTop: 4 }, delete: { fontSize: 13, fontWeight: "600" } });
