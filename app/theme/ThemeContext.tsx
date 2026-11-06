import React, { createContext, useContext, useMemo, useState } from "react";
import { useColorScheme } from "react-native";
import { darkTokens, lightTokens, ThemeTokens } from "./tokens";

type ThemeContextValue = { isDark: boolean; tokens: ThemeTokens; toggleTheme: () => void };
const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [override, setOverride] = useState<boolean | null>(null);
  const isDark = override ?? system === "dark";
  const value = useMemo(() => ({ isDark, tokens: isDark ? darkTokens : lightTokens, toggleTheme: () => setOverride((v) => !(v ?? isDark)) }), [isDark]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
export function useTheme() { const value = useContext(ThemeContext); if (!value) throw new Error("useTheme must be used inside ThemeProvider"); return value; }
