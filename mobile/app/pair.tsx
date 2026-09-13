import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

const PARTNER_POLL_MS = 3000;

export default function Pair() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile, refreshProfile, signOut } = useAuth();
  const [code, setCode] = useState("");
  const [myCode, setMyCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoredRef = useRef(false);

  const coupleId = profile?.couple_id ?? null;
  const userId = session?.user.id ?? null;

  const fetchInviteCode = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("create_couple_invite");
    if (rpcError) throw new Error(rpcError.message);
    return data as string;
  }, []);

  // Landing here while already in a couple means we invited someone and they
  // haven't joined yet -- so show that same code again rather than stranding
  // them without it.
  useEffect(() => {
    if (!coupleId || restoredRef.current || myCode) return;
    restoredRef.current = true;
    fetchInviteCode()
      .then((restored) => {
        setMyCode(restored);
        setWaiting(true);
      })
      .catch(() => {
        // Already paired, or the code couldn't be read -- either way there's
        // nothing to restore and the normal buttons still work.
      });
  }, [coupleId, myCode, fetchInviteCode]);

  // While waiting, watch for the partner's profile joining the couple, then
  // go through. Polling rather than realtime: no channel setup, and this
  // screen is short-lived.
  useEffect(() => {
    if (!waiting || !coupleId || !userId) return;

    let cancelled = false;

    async function checkForPartner() {
      const { data } = await supabase
        .from("profiles")
        .select("id")
        .eq("couple_id", coupleId);

      if (cancelled) return;

      const partner = data?.find((m) => m.id !== userId);
      if (partner) {
        cancelled = true;
        await refreshProfile();
        router.replace("/");
      }
    }

    checkForPartner();
    const interval = setInterval(checkForPartner, PARTNER_POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [waiting, coupleId, userId, refreshProfile]);

  async function handleCreateInvite() {
    setError(null);
    setLoading(true);
    try {
      const created = await fetchInviteCode();
      setMyCode(created);
      // The RPC set our couple_id as a side effect; pick it up so the poll
      // below has a couple to watch.
      await refreshProfile();
      setWaiting(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create a code.");
    } finally {
      setLoading(false);
    }
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

      {waiting && myCode ? (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Send this to your partner</Text>
            <Text style={styles.code}>{myCode}</Text>
          </View>

          <View style={styles.waitingRow}>
            <ActivityIndicator color={t.accent} />
            <Text style={styles.waitingText}>
              Waiting for them to enter it. This screen moves on by itself.
            </Text>
          </View>
        </>
      ) : (
        <>
          <Pressable
            style={press(styles.buttonSecondary)}
            onPress={handleCreateInvite}
            disabled={loading}
          >
            <Text style={styles.buttonSecondaryText}>Create an invite code</Text>
          </Pressable>

          <Text style={styles.orText}>— or —</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter partner's code"
            autoCapitalize="characters"
            value={code}
            onChangeText={setCode}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={press(styles.button)} onPress={handleRedeemInvite} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={t.surface} />
            ) : (
              <Text style={styles.buttonText}>Pair up</Text>
            )}
          </Pressable>
        </>
      )}

      {waiting && error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable onPress={() => signOut()} style={press({ marginTop: 24 })}>
        <Text style={styles.link}>Signed in as {session?.user.email}. Sign out</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg },
  title: { fontSize: 22, fontWeight: "600", textAlign: "center", marginBottom: 8 },
  subtitle: { fontSize: 14, color: t.textSecondary, textAlign: "center", marginBottom: 24, lineHeight: 20 },
  input: {
    backgroundColor: t.surface,
    borderRadius: t.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
    textAlign: "center",
    letterSpacing: 2,
  },
  button: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: t.surface, fontWeight: "600", fontSize: 15 },
  buttonSecondary: {
    backgroundColor: t.surface,
    borderRadius: t.radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.accent,
  },
  buttonSecondaryText: { color: t.accent, fontWeight: "600", fontSize: 15 },
  codeBox: { alignItems: "center", marginTop: 8, marginBottom: 16 },
  codeLabel: { fontSize: 12, color: t.textSecondary, marginBottom: 4 },
  code: { fontSize: 36, fontWeight: "700", letterSpacing: 6 },
  waitingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  waitingText: { fontSize: 13, color: t.textSecondary, flexShrink: 1 },
  orText: { textAlign: "center", color: t.textMuted, marginVertical: 16 },
  error: { color: t.danger, marginBottom: 8, fontSize: 13, textAlign: "center" },
  link: { textAlign: "center", color: t.textMuted, fontSize: 13 },
  });
