import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { press } from "@/components/press";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";

/**
 * Where the reset email lands.
 *
 * Supabase sends the recovery tokens in the URL FRAGMENT, and the client is
 * built with detectSessionInUrl off -- right for a phone, where there is no
 * browser address bar to read -- so nothing picks them up on its own. This
 * screen takes them off the link itself, exchanges them for a session, and
 * then lets the person set a new password.
 *
 * Without it the button on the sign-in screen would be a promise the app
 * cannot keep: an email arrives, the link opens the app, and the password
 * still cannot be changed. A dead end dressed as a way out is worse than no
 * way out at all, because people stop looking for the real one.
 */
export default function ResetPassword() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const url = Linking.useURL();

  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Read from the link rather than copied into state: what the link says
  // never changes while this screen is open, and a value that cannot change
  // has no business being state.
  const link = useMemo(() => {
    if (!url) return null;

    // The tokens are after the #, which is not part of the query string.
    const params = new URLSearchParams(url.split("#")[1] ?? "");

    return {
      accessToken: params.get("access_token"),
      refreshToken: params.get("refresh_token"),
      // An expired or already-used link comes back as an error rather than a
      // pair of tokens, and saying so is the difference between "ask for
      // another one" and "this app is broken".
      problem: (params.get("error_description") ?? params.get("error"))?.replace(/\+/g, " ") ?? null,
    };
  }, [url]);

  useEffect(() => {
    if (!link?.accessToken || !link.refreshToken || link.problem) return;

    supabase.auth
      .setSession({ access_token: link.accessToken, refresh_token: link.refreshToken })
      .then(({ error: sessionError }) => {
        if (sessionError) {
          setError(sessionError.message);
          return;
        }
        setReady(true);
      });
  }, [link]);

  const shownError = error ?? link?.problem ?? null;

  async function save() {
    if (password.length < 6) {
      setError("Six characters or more.");
      return;
    }

    setError(null);
    setSaving(true);
    const { error: saveError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (saveError) {
      setError(saveError.message);
      return;
    }

    // Already signed in as themselves by this point, so there is nothing to
    // sign in to -- straight through to the app.
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Set a new password</Text>

      {shownError ? <Text style={styles.error}>{shownError}</Text> : null}

      {ready ? (
        <>
          <Text style={styles.subtitle}>
            Pick something you will remember. You stay signed in on this phone afterwards.
          </Text>

          <TextInput
            style={styles.input}
            placeholder="New password"
            placeholderTextColor={t.textMuted}
            secureTextEntry
            autoFocus
            value={password}
            onChangeText={setPassword}
          />

          <Pressable style={press(styles.button)} onPress={save} disabled={saving}>
            {saving ? (
              <ActivityIndicator color={t.surface} />
            ) : (
              <Text style={styles.buttonText}>Save it</Text>
            )}
          </Pressable>
        </>
      ) : shownError ? (
        <Pressable onPress={() => router.replace("/sign-in")} hitSlop={8}>
          <Text style={styles.link}>Back to sign in</Text>
        </Pressable>
      ) : (
        <>
          <ActivityIndicator style={{ marginTop: 24 }} />
          <Text style={styles.subtitle}>Checking your link...</Text>
        </>
      )}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: t.bg },
    title: {
      ...t.type.display,
      color: t.textPrimary,
      textAlign: "center",
      marginBottom: t.space(2),
    },
    subtitle: {
      ...t.type.body,
      color: t.textSecondary,
      textAlign: "center",
      marginBottom: t.space(6),
      marginTop: t.space(2),
    },
    input: {
      backgroundColor: t.surface,
      borderRadius: t.radius.md,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginBottom: 12,
      color: t.textPrimary,
      ...t.type.body,
    },
    button: {
      backgroundColor: t.brand,
      borderRadius: t.radius.pill,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 4,
    },
    buttonText: { ...t.type.label, color: t.textOnBrand },
    error: { color: t.danger, marginBottom: 8, ...t.type.caption, textAlign: "center" },
    link: { marginTop: 20, textAlign: "center", color: t.accent, ...t.type.body },
  });
