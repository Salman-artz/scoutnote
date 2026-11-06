import { Tabs } from "expo-router";
import { ThemeProvider } from "../theme/ThemeContext";

export default function RootLayout() {
  return <ThemeProvider><Tabs screenOptions={{ headerShown: false }}><Tabs.Screen name="index" options={{ title: "Chat" }} /><Tabs.Screen name="notes" options={{ title: "Notes" }} /></Tabs></ThemeProvider>;
}
