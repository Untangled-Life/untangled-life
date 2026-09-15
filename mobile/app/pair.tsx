import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Share,
} from "react-native";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { carryCoverInto } from "@/lib/photos";
import { useAuth } from "@/contexts/auth";

const PARTNER_POLL_MS = 3000;

export default function Pair() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile, refreshProfile, signOut } = useAuth();
  // A code carried in by the invite link the other phone shared. Prefilled
  // rather than auto-redeemed: the person still taps to join, so a link
  // opened by accident does not pair two strangers.
  const { code: linkedCode } = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(typeof linkedCode === "string" ? linkedCode.toUpperCase() : "");
  const [myCode, setMyCode] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const restoredRef = useRef(false);

  // The couple they end up in, for the cover photo to follow them into.
  const joinedCoupleRef = useRef<string | null>(null);

  const coupleId = profile?.couple_id ?? null;
  const userId = session?.user.id ?? null;

  const fetchInviteCode = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc("create_couple_invite_guarded");
    if (rpcError) throw new Error(rpcError.message);
    return data as string;
  }, []);

  // Coming back to a code you already sent, so it is here rather than lost.
  //
  // A READ. It used to call create_couple_invite, which was the same thing
  // back when having a couple could only mean you had already made a code.
  // Everybody has a couple from sign-up now, so creating here would hand a
  // code to somebody who arrived holding their partner's -- and drop them on
  // a spinner saying "waiting for them to enter it" instead of the box they
  // came for.
  useEffect(() => {
    if (!coupleId || restoredRef.current || myCode) return;
    restoredRef.current = true;

    supabase
      .rpc("my_pending_invite")
      .then(({ data }) => {
        if (!data) return;
        setMyCode(data as string);
        setWaiting(true);
      });
  }, [coupleId, myCode]);

  // While waiting, watch for the partner's profile joining the couple, then
  // go through. Polling rather than realtime: no channel setup, and this
  // screen is short-lived.
  useEffect(() => {
    if (!coupleId || !userId) return;

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
  }, [coupleId, userId, refreshProfile]);

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

    // The cover you set on your own is stored under YOUR couple's id, and
    // that couple is about to stop existing. carryCoverInto takes the bytes
    // while the path is still readable, removes the file properly rather
    // than orphaning it, and puts it back under the couple you have joined
    // if they have not got one of their own.
    const { error: rpcError } = await carryCoverInto(
      coupleId,
      async () => {
        const { data } = await supabase
          .from("couples")
          .select("cover_path")
          .eq("id", coupleId ?? "")
          .maybeSingle();
        return { coverPath: (data?.cover_path as string | null) ?? null };
      },
      async () => {
        const { data: reason, error: joinError } = await supabase.rpc(
          "redeem_couple_invite_guarded",
          { invite_code: code.trim().toUpperCase() }
        );

        // The guarded function reports the reason in its RETURN value rather
        // than by raising, so that a wrong code can still record the attempt
        // that rate-limits the next one. A transport error is separate.
        if (joinError) return { error: joinError.message };
        if (reason) return { error: reason as string };

        // Read here rather than after, because the step that puts the cover
        // back runs inside this call and needs to know where to put it. The
        // profile in context is still a render behind at this point.
        const { data: joinedProfile } = await supabase
          .from("profiles")
          .select("couple_id")
          .eq("id", userId ?? "")
          .maybeSingle();

        joinedCoupleRef.current = (joinedProfile?.couple_id as string | null) ?? null;
        return { error: null };
      },
      () => joinedCoupleRef.current,
      async (path) => {
        const joined = joinedCoupleRef.current;
        if (joined) await supabase.from("couples").update({ cover_path: path }).eq("id", joined);
      }
    );

    if (rpcError) {
      setLoading(false);
      setError(rpcError);
      return;
    }

    setLoading(false);
    await refreshProfile();
    router.replace("/");
  }

  async function shareCode() {
    if (!myCode) return;
    try {
      // A tappable link, with the code spelled out underneath for anybody
      // whose messaging app strips it or who is reading it on the same phone
      // they will type it into. The scheme is the app's own, so it opens
      // straight onto this screen with the code filled in.
      const link = Linking.createURL("/pair", { queryParams: { code: myCode } });
      await Share.share({
        message: `Join me on Untangled Life: ${link}\n\nOr enter the code ${myCode} by hand.`,
      });
    } catch {
      // The person dismissed the sheet, or the platform refused it. Either
      // way the code is still on screen to read out, so there is nothing
      // useful to say about it.
    }
  }

  return (
    <View style={styles.container}>
      {/* This used to be a wall with nothing behind it, so there was nowhere
          to go back to. It is somewhere you choose to come now -- except when
          the gate sent you because there is no couple to go back to, and the
          app behind would only send you here again. */}
      {coupleId ? (
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
          hitSlop={10}
          style={press(styles.backTap)}
        >
          <Text style={styles.back}>&lsaquo; Not now</Text>
        </Pressable>
      ) : null}

      <Text style={styles.title}>Link up with your partner</Text>
      <Text style={styles.subtitle}>
        One of you creates a code, the other enters it. That pairs your two accounts
        into one couple.
      </Text>

      {waiting && myCode ? (
        <>
          <View style={styles.codeBox}>
            <Text style={styles.codeLabel}>Send this to your partner</Text>
            <Text style={styles.code} selectable>
              {myCode}
            </Text>
          </View>

          {/* It said "send this to your partner" above six characters that
              could not be copied, shared or even selected. The only way to
              get it to the other phone was to read it out. */}
          <Pressable style={press(styles.buttonSecondary)} onPress={shareCode} hitSlop={8}>
            <Text style={styles.buttonSecondaryText}>Send the code</Text>
          </Pressable>

          <View style={styles.waitingRow}>
            <ActivityIndicator color={t.accent} />
            <Text style={styles.waitingText}>
              Waiting for them to enter it. This screen moves on by itself.
            </Text>
          </View>

          {/* Tapping Create when you meant to enter theirs replaced this
              whole screen, and nothing ever set waiting back to false -- so
              the only way out was to sign out of the app. */}
          {/* Either code works from here: this phone keeps watching for
              them to use the one above, and entering theirs retires the one
              you sent (redeem_couple_invite deletes the couple it left
              behind, and the code goes with it). */}
          <Pressable onPress={() => setWaiting(false)} hitSlop={8}>
            <Text style={styles.link}>Enter their code instead</Text>
          </Pressable>
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

          <Text style={styles.orText}>or</Text>

          <TextInput
            style={styles.input}
            placeholder="Enter partner's code"
        placeholderTextColor={t.textMuted}
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

      <Text style={styles.footnote}>
        Whatever you have already put in is yours and stays yours. When they join, it becomes
        both of yours.
      </Text>

      <Pressable onPress={() => signOut()} style={press({ marginTop: 24 })}>
        <Text style={styles.link}>Signed in as {session?.user.email}. Sign out</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg },
  title: { ...t.type.display, color: t.textPrimary, textAlign: "center", marginBottom: 8 },
  subtitle: { ...t.type.body, color: t.textSecondary, textAlign: "center", marginBottom: 24 },
  input: {
    backgroundColor: t.surface,
    borderRadius: t.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    ...t.type.body,
    textAlign: "center",
    letterSpacing: 2,
    color: t.textPrimary,
  },
  button: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingVertical: 14,
    alignItems: "center",
  },
  buttonText: { color: t.textOnBrand, ...t.type.heading },
  buttonSecondary: {
    backgroundColor: t.surface,
    borderRadius: t.radius.pill,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: t.accent,
  },
  buttonSecondaryText: { color: t.accent, ...t.type.heading },
  codeBox: { alignItems: "center", marginTop: 8, marginBottom: 16 },
  codeLabel: { ...t.type.caption, color: t.textSecondary, marginBottom: 4 },
  // The invite code is the one thing on this screen anybody reads out loud.
  code: { ...t.type.hero, color: t.brand, letterSpacing: 6 },
  waitingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  waitingText: { ...t.type.caption, color: t.textSecondary, flexShrink: 1 },
  orText: { textAlign: "center", color: t.textMuted, marginVertical: 16 },
  error: { color: t.danger, marginBottom: 8, ...t.type.caption, textAlign: "center" },
  link: { textAlign: "center", color: t.textMuted, ...t.type.caption },
  backTap: { alignSelf: "flex-start", paddingVertical: t.space(1), marginBottom: t.space(2) },
  back: { ...t.type.label, color: t.accent },
  footnote: {
    ...t.type.caption,
    color: t.textMuted,
    textAlign: "center",
    marginTop: t.space(6),
  },
  });
