import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function SignUp() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSignUp() {
    setError(null);
    setNotice(null);
    if (!name.trim() || !email.trim() || password.length < 8) {
      setError("Name, email and an 8+ character password are all required.");
      return;
    }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { display_name: name.trim() } },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    // A database trigger creates the profiles row from the display_name we
    // passed above, whether or not email confirmation leaves us signed in.
    setLoading(false);

    if (!data.session) {
      // The account was created. Saying so in the red, in the same place the
      // password complaints appear, reads as "that failed" -- and somebody
      // who believes their sign-up failed tries again with the same address
      // and gets a real error the second time.
      setNotice("Account created. Check your email to confirm it, then sign in.");
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
      <Text style={styles.title}>Get started</Text>
      <Text style={styles.subtitle}>It takes a minute, and you only do it once.</Text>

      <TextInput style={styles.input} placeholder="Your name"
        placeholderTextColor={t.textMuted} value={name} onChangeText={setName} />
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
        placeholder="Password (8+ characters)"
        placeholderTextColor={t.textMuted}
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      <Pressable style={press(styles.button)} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color={t.surface} /> : <Text style={styles.buttonText}>Sign up</Text>}
      </Pressable>

      <Link href="/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg },
  // The brand's own face, not small capitals. Uppercasing a product name
  // changes how it is written, and this is the first screen anybody sees.
  wordmark: {
    ...t.type.title,
    color: t.brand,
    textAlign: "center",
    marginBottom: t.space(2),
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
  notice: { color: t.accent, marginBottom: 8, ...t.type.caption },
  link: { marginTop: 20, textAlign: "center", color: t.accent, ...t.type.body },
  });
