import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function SignIn() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      {/* The brand is a mark, not the headline. Setting "Untangled Life"
          in the largest type on the screen spends it on something the person
          already knows -- they just tapped the icon. */}
      <Text style={styles.wordmark}>Untangled Life</Text>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Two diaries, one screen.</Text>

      <TextInput
        style={styles.input}
        placeholder="you@email.com"
        placeholderTextColor={t.textMuted}
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={t.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={press(styles.button)} onPress={handleSignIn} disabled={loading}>
        {loading ? <ActivityIndicator color={t.surface} /> : <Text style={styles.buttonText}>Sign in</Text>}
      </Pressable>

      <Link href="/sign-up" style={styles.link}>
        Don&apos;t have an account? Sign up
      </Link>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg },
  wordmark: {
    ...t.type.eyebrow,
    color: t.brand,
    textAlign: "center",
    marginBottom: t.space(3),
  },
  title: { ...t.type.display, color: t.textPrimary, textAlign: "center", marginBottom: t.space(1) },
  subtitle: { ...t.type.body, color: t.textSecondary, textAlign: "center", marginBottom: t.space(7) },
  input: {
    backgroundColor: t.surface,
    borderRadius: t.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    ...t.type.body,
    color: t.textPrimary,
  },
  button: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: t.textOnBrand, ...t.type.heading },
  error: { color: t.danger, marginBottom: 8, ...t.type.caption },
  link: { marginTop: 20, textAlign: "center", color: t.accent, ...t.type.body },
  });
