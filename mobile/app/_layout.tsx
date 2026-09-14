import { Stack } from "expo-router";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Fraunces_700Bold } from "@expo-google-fonts/fraunces/700Bold";
import { AuthProvider } from "@/contexts/auth";
import { ThemeProvider, useTheme } from "@/contexts/theme";

function ThemedShell() {
  const t = useTheme();

  // Two weights, imported from their own subpaths rather than from the
  // package root. The root re-exports all eighteen, and Metro bundles what it
  // sees: importing from there quietly adds about three megabytes of italics
  // and hairline weights nothing in the app uses.
  const [fontsLoaded] = useFonts({ Fraunces_600SemiBold, Fraunces_700Bold });

  // Hold on the background colour until the faces are ready. Rendering first
  // and swapping in the font when it arrives reflows every heading on screen,
  // which is a worse first impression than a beat of nothing -- and the beat
  // is only a beat, because the files are bundled rather than fetched.
  if (!fontsLoaded) {
    return (
      <>
        <StatusBar style={t.scheme === "dark" ? "light" : "dark"} />
        <View style={{ flex: 1, backgroundColor: t.bg }} />
      </>
    );
  }

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
