import { Stack } from "expo-router";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "@/contexts/auth";
import { ThemeProvider, useTheme } from "@/contexts/theme";

function ThemedShell() {
  const t = useTheme();
  return (
    <>
      <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: t.bg },
        }}
      />
    </>
  );
}

export default function RootLayout() {
  return (
    // Theme sits outside Auth so that sign-in and the loading states are themed
    // too, not just the screens behind the gate.
    <ThemeProvider>
      <SafeAreaProvider>
        <AuthProvider>
          <ThemedShell />
        </AuthProvider>
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
