import { StyleSheet, Text, View } from "react-native";
import { EmptyState } from "../components/EmptyState";
import { useTheme } from "../theme/ThemeContext";
export default function NotesScreen() { const { tokens } = useTheme(); return <View style={[styles.container, { backgroundColor: tokens.background }]}><Text style={[styles.title, { color: tokens.text }]}>Notes</Text><EmptyState title="Catatan segera hadir" description="Catatan tersimpan akan tampil di sini." /></View>; }
const styles = StyleSheet.create({ container: { flex: 1, paddingTop: 60, paddingHorizontal: 16 }, title: { fontSize: 24, fontWeight: "700" } });
