import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AccentName, DEFAULT_ACCENT, Theme, ThemeMode, isAccentName, themeFor } from "@/theme/tokens";

const STORAGE_KEY = "untangled.themeMode";
const ACCENT_KEY = "untangled.accent";

type ThemeContextValue = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  accent: AccentName;
  setAccent: (accent: AccentName) => void;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme() === "dark" ? "dark" : "light";
  const [mode, setModeState] = useState<ThemeMode>("system");
  const [accent, setAccentState] = useState<AccentName>(DEFAULT_ACCENT);

  useEffect(() => {
    AsyncStorage.multiGet([STORAGE_KEY, ACCENT_KEY])
      .then((entries) => {
        const stored = Object.fromEntries(entries);
        const storedMode = stored[STORAGE_KEY];
        if (storedMode === "light" || storedMode === "dark" || storedMode === "system") {
          setModeState(storedMode);
        }
        if (isAccentName(stored[ACCENT_KEY])) setAccentState(stored[ACCENT_KEY]);
      })
      .catch(() => {
        // Preferences are a convenience, not state worth failing startup over.
      });
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const setAccent = useCallback((next: AccentName) => {
    setAccentState(next);
    AsyncStorage.setItem(ACCENT_KEY, next).catch(() => {});
  }, []);

  const value = useMemo(
    () => ({ theme: themeFor(mode, system, accent), mode, setMode, accent, setAccent }),
    [mode, system, accent, setMode, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx.theme;
}

export function useThemeMode() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeMode must be used within a ThemeProvider");
  return {
    mode: ctx.mode,
    setMode: ctx.setMode,
    scheme: ctx.theme.scheme,
    accent: ctx.accent,
    setAccent: ctx.setAccent,
  };
}

/**
 * Build a screen's styles from the active theme, rebuilding only when the
 * theme actually changes.
 *
 * The factory calls StyleSheet.create itself rather than this wrapper doing it,
 * so React Native's own typing still narrows literals like flexDirection:
 * "row" — passing a bare object loses that and every such property widens to
 * string.
 */
export function useThemedStyles<T>(factory: (theme: Theme) => T): T {
  const theme = useTheme();
  return useMemo(() => factory(theme), [theme, factory]);
}
