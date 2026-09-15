import { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { Link, router } from "expo-router";
import * as Linking from "expo-linking";
import { supabase } from "@/lib/supabase";
import { challengeExisting, needsChallenge, redeemRecoveryCode } from "@/lib/mfa";

export default function SignIn() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Not an error, so not in the red. Said in its own words below the form.
  const [notice, setNotice] = useState<string | null>(null);

  // The second step, shown only when the account has it on. The password was
  // right; this is the six digits from their authenticator.
  const [needsCode, setNeedsCode] = useState(false);
  const [code, setCode] = useState("");
  // The escape hatch: a lost authenticator, answered with a recovery code
  // instead. Redeeming one removes two-factor, so this is also where somebody
  // recovers a phone they can no longer get the six digits from.
  const [usingRecovery, setUsingRecovery] = useState(false);

  async function handleSignIn() {
    setError(null);
    // The reset notice is about a different attempt. Left up, it sits in
    // green directly above a red failure, on the one screen where those two
    // colours have just been given separate jobs.
    setNotice(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      setLoading(false);
      setError(signInError.message);
      return;
    }

    // Password accepted. If the account has an authenticator, the session is
    // aal1 until the code is entered, and the database hands back nothing to
    // an aal1 session, so going through to the app now would show a couple
    // their own data locked away. Ask here instead.
    if (await needsChallenge()) {
      setLoading(false);
      setNeedsCode(true);
      return;
    }

    setLoading(false);
    router.replace("/");
  }

  async function handleCode() {
    setError(null);
    setLoading(true);
    const { ok, error: codeError } = await challengeExisting(code);
    setLoading(false);
    if (!ok) {
      setError(codeError ?? "That code didn't work.");
      return;
    }
    router.replace("/");
  }

  async function handleRecovery() {
    setError(null);
    setLoading(true);
    // The session is already signed in at the password's level; redeeming the
    // code takes the factor off, so the app is reachable straight after.
    const { ok, error: recoveryError } = await redeemRecoveryCode(code);
    if (!ok) {
      setLoading(false);
      setError(recoveryError ?? "That recovery code didn't work.");
      return;
    }
    // The factor is gone server-side, but the client still holds the session
    // it signed in with, whose cached assurance level remembers a factor.
    // Refresh it so nothing downstream still believes a code is owed.
    await supabase.auth.refreshSession();
    setLoading(false);
    router.replace("/");
  }

  /**
   * A forgotten password was a locked account with no way back in, and the
   * couple's whole shared diary behind it. Reuses the email field, because
   * asking for it twice on the screen where they have just typed it is the
   * kind of thing that makes people give up.
   *
   * The wording never says whether the address is registered: that would
   * turn this into a way of finding out who has an account.
   */
  async function handleReset() {
    const address = email.trim();

    if (!address) {
      setNotice(null);
      setError("Put your email address in first, and I'll send you a reset link.");
      return;
    }

    setError(null);
    setNotice(null);
    setLoading(true);
    // Back into the app, not to the project's web Site URL. Without this the
    // link opens a page that has nothing to do with the phone the person is
    // holding, and the password can never actually be changed.
    await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: Linking.createURL("/reset-password"),
    });
    setLoading(false);
    setNotice(`If there's an account for ${address}, a reset link is on its way.`);
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
      {needsCode ? null : (
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor={t.textMuted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      )}

      {needsCode ? (
        <TextInput
          style={styles.input}
          placeholder={usingRecovery ? "Recovery code" : "6-digit code"}
          placeholderTextColor={t.textMuted}
          keyboardType={usingRecovery ? "default" : "number-pad"}
          autoCapitalize="characters"
          autoFocus
          value={code}
          onChangeText={setCode}
          maxLength={usingRecovery ? 9 : 6}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {needsCode ? (
        <>
          <Pressable
            style={press(styles.button)}
            onPress={usingRecovery ? handleRecovery : handleCode}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={t.surface} />
            ) : (
              <Text style={styles.buttonText}>{usingRecovery ? "Use recovery code" : "Verify"}</Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setUsingRecovery((v) => !v);
              setCode("");
              setError(null);
            }}
            hitSlop={8}
          >
            <Text style={styles.link}>
              {usingRecovery
                ? "Back to your authenticator code"
                : "Lost your authenticator? Use a recovery code"}
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <Pressable style={press(styles.button)} onPress={handleSignIn} disabled={loading}>
            {loading ? (
              <ActivityIndicator color={t.surface} />
            ) : (
              <Text style={styles.buttonText}>Sign in</Text>
            )}
          </Pressable>

          <Pressable onPress={handleReset} disabled={loading} hitSlop={8}>
            <Text style={styles.link}>Forgotten your password?</Text>
          </Pressable>

          <Link href="/sign-up" style={styles.link}>
            Don&apos;t have an account? Sign up
          </Link>
        </>
      )}
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
  // Something that worked has no business being the same colour as
  // something that failed, in the same place on the same screen.
  notice: { color: t.accent, marginBottom: 8, ...t.type.caption },
  hint: { color: t.textMuted, textAlign: "center", marginTop: t.space(3), ...t.type.caption },
  link: { marginTop: 20, textAlign: "center", color: t.accent, ...t.type.body },
  });
