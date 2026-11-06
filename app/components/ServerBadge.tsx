import { StyleSheet, Text } from "react-native";
import { useTheme } from "../theme/ThemeContext";
export function ServerBadge({ type }: { type: "read" | "write" }) { const { tokens } = useTheme(); const color = type === "read" ? tokens.mcpRead : tokens.mcpWrite; return <Text style={[styles.badge, { color, borderColor: color }]}>{type === "read" ? "MCP A: READ" : "MCP B: WRITE"}</Text>; }
const styles = StyleSheet.create({ badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, fontSize: 11, fontWeight: "600" } });
