import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { Link, router } from "expo-router";
import { supabase } from "@/lib/supabase";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignUp() {
    setError(null);
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
      setError("Check your email to confirm your account, then sign in.");
      return;
    }

    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Untangled Life</Text>
      <Text style={styles.subtitle}>Create your account</Text>

      <TextInput style={styles.input} placeholder="Your name" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="you@email.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password (8+ characters)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleSignUp} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign up</Text>}
      </Pressable>

      <Link href="/sign-in" style={styles.link}>
        Already have an account? Sign in
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F7F5F0" },
  title: { fontSize: 24, fontWeight: "600", textAlign: "center", marginBottom: 4 },
  subtitle: { fontSize: 16, color: "#6B6B6B", textAlign: "center", marginBottom: 24 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
  },
  button: {
    backgroundColor: "#D85A30",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  error: { color: "#B3261E", marginBottom: 8, fontSize: 13 },
  link: { marginTop: 20, textAlign: "center", color: "#1D9E75", fontSize: 14 },
});
