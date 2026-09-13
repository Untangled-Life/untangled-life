import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

export default function Pair() {
  const { session, refreshProfile, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [myCode, setMyCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreateInvite() {
    setError(null);
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("create_couple_invite");
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    setMyCode(data as string);
  }

  async function handleRedeemInvite() {
    if (!code.trim()) return;
    setError(null);
    setLoading(true);
    const { error: rpcError } = await supabase.rpc("redeem_couple_invite", {
      invite_code: code.trim().toUpperCase(),
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    await refreshProfile();
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Link up with your partner</Text>
      <Text style={styles.subtitle}>
        One of you creates a code, the other enters it. That pairs your two accounts
        into one couple.
      </Text>

      <Pressable style={styles.buttonSecondary} onPress={handleCreateInvite} disabled={loading}>
        <Text style={styles.buttonSecondaryText}>Create an invite code</Text>
      </Pressable>

      {myCode ? (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>Send this to your partner</Text>
          <Text style={styles.code}>{myCode}</Text>
        </View>
      ) : null}

      <Text style={styles.orText}>— or —</Text>

      <TextInput
        style={styles.input}
        placeholder="Enter partner's code"
        autoCapitalize="characters"
        value={code}
        onChangeText={setCode}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable style={styles.button} onPress={handleRedeemInvite} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Pair up</Text>}
      </Pressable>

      <Pressable onPress={() => signOut()} style={{ marginTop: 24 }}>
        <Text style={styles.link}>Signed in as {session?.user.email}. Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#F7F5F0" },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#6B6B6B", textAlign: "center", marginBottom: 24, lineHeight: 20 },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    textAlign: "center",
    letterSpacing: 2,
  },
  button: {
    backgroundColor: "#D85A30",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  buttonSecondary: {
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#1D9E75",
  },
  buttonSecondaryText: { color: "#1D9E75", fontWeight: "600", fontSize: 15 },
  codeBox: { alignItems: "center", marginTop: 16, marginBottom: 8 },
  codeLabel: { fontSize: 12, color: "#6B6B6B", marginBottom: 4 },
  code: { fontSize: 28, fontWeight: "700", letterSpacing: 4 },
  orText: { textAlign: "center", color: "#9A9A9A", marginVertical: 16 },
  error: { color: "#B3261E", marginBottom: 8, fontSize: 13, textAlign: "center" },
  link: { textAlign: "center", color: "#9A9A9A", fontSize: 13 },
});
