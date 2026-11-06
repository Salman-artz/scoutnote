import { Pressable, StyleSheet, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
export function ExampleChip({ label, onPress }: { label: string; onPress: (prompt: string) => void }) { const { tokens } = useTheme(); return <Pressable onPress={() => onPress(label)} style={[styles.chip, { borderColor: tokens.border, backgroundColor: tokens.surface }]}><Text style={{ color: tokens.text, fontSize: 13 }}>{label}</Text></Pressable>; }
const styles = StyleSheet.create({ chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9, marginRight: 8, marginBottom: 8 } });
