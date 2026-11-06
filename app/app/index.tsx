import { StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";

export default function IndexScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>ScoutNote</Text>
      <Text style={styles.subtitle}>Mobile AI Chatbot with Dual-MCP</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F3EE",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#292B26",
  },
  subtitle: {
    fontSize: 14,
    color: "#858579",
    marginTop: 8,
  },
});
