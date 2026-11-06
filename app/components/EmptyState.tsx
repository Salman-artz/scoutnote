import { StyleSheet, Text, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";
export function EmptyState({ iconName = "✦", title, description }: { iconName?: string; title: string; description: string }) { const { tokens } = useTheme(); return <View style={styles.wrap}><Text style={styles.icon}>{iconName}</Text><Text style={[styles.title, { color: tokens.text }]}>{title}</Text><Text style={[styles.description, { color: tokens.muted }]}>{description}</Text></View>; }
const styles = StyleSheet.create({ wrap: { alignItems: "center", justifyContent: "center", padding: 32 }, icon: { fontSize: 30, marginBottom: 12 }, title: { fontSize: 20, fontWeight: "600", textAlign: "center" }, description: { fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 8 } });
