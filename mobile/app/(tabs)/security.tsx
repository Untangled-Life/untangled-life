import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { QRCode } from "@/components/qr-code";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { succeeded, tapped, warned } from "@/lib/haptics";
import { supabase } from "@/lib/supabase";
import { beginEnrolment, disableTotp, submitCode, verifiedFactors, type Enrolment } from "@/lib/mfa";
import { isLockEnabled, lockCapability, setLockEnabled, type LockCapability } from "@/lib/appLock";
import { useAppLock } from "@/contexts/appLock";
import { Theme } from "@/theme/tokens";

/**
 * The lock on the front door and the lock on the phone.
 *
 * Two different things, deliberately on one screen because to somebody
 * setting up their account they are one question: how do I keep this shut.
 * Two-factor protects the ACCOUNT, wherever it is signed in. Face ID protects
 * this PHONE. Neither is on unless it is turned on here.
 */
export default function Security() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { refresh: refreshLock } = useAppLock();

  const [loading, setLoading] = useState(true);
  const [hasTotp, setHasTotp] = useState(false);

  // Enrolment, once begun: the QR and the secret, then the code they type back.
  const [enrolment, setEnrolment] = useState<Enrolment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [lockCap, setLockCap] = useState<LockCapability | null>(null);
  const [lockOn, setLockOn] = useState(false);

  const reload = useCallback(async () => {
    const [factors, cap, on] = await Promise.all([
      verifiedFactors(),
      lockCapability(),
      isLockEnabled(),
    ]);
    setHasTotp(factors.length > 0);
    setLockCap(cap);
    setLockOn(on);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function startTotp() {
    tapped();
    setBusy(true);
    const { enrolment: started, error } = await beginEnrolment();
    setBusy(false);
    if (error || !started) {
      warned();
      Alert.alert("Couldn't start setup", error ?? "Please try again.");
      return;
    }
    setEnrolment(started);
  }

  async function confirmTotp() {
    if (!enrolment) return;
    setBusy(true);
    const { ok, error } = await submitCode(enrolment.factorId, code);
    setBusy(false);
    if (!ok) {
      warned();
      Alert.alert("That code didn't work", error ?? "Check your authenticator and try again.");
      return;
    }
    succeeded();
    setEnrolment(null);
    setCode("");
    await reload();
    Alert.alert(
      "Two-factor is on",
      "You'll enter a code from your authenticator each time you sign in on a new device."
    );
  }

  function confirmDisableTotp() {
    Alert.alert(
      "Turn off two-factor?",
      "Your account will be protected by your password alone.",
      [
        { text: "Keep it on", style: "cancel" },
        {
          text: "Turn off",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const { ok, error } = await disableTotp();
            setBusy(false);
            if (!ok) {
              warned();
              Alert.alert("Couldn't turn it off", error ?? "Please try again.");
              return;
            }
            await reload();
          },
        },
      ]
    );
  }

  async function copySecret() {
    if (!enrolment) return;
    await Clipboard.setStringAsync(enrolment.secret);
    tapped();
    Alert.alert("Copied", "Paste it into your authenticator if it can't scan the code.");
  }

  async function toggleLock(next: boolean) {
    tapped();
    setLockOn(next);
    await setLockEnabled(next);
    await refreshLock();
  }

  function signOutEverywhere() {
    Alert.alert(
      "Sign out everywhere else?",
      "Every other phone or tablet signed in to this account will be signed out. This device stays signed in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out others",
          onPress: async () => {
            const { error } = await supabase.auth.signOut({ scope: "others" });
            if (error) {
              warned();
              Alert.alert("Couldn't do that", error.message);
              return;
            }
            succeeded();
            Alert.alert("Done", "Other devices have been signed out.");
          },
        },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title="Security"
        back="Settings"
        intro="Two-factor guards the account. Face ID guards this phone. Both are off until you turn them on."
      />

      {/* ---- Two-factor ---- */}
      <Text style={styles.groupTitle}>Two-factor</Text>

      {enrolment ? (
        <View style={styles.card}>
          <Text style={styles.rowLabel}>Scan this with your authenticator</Text>
          <Text style={styles.rowHint}>
            Google Authenticator, 1Password, Authy, whichever you use. Then enter the six digits it
            shows.
          </Text>

          <View style={styles.qrWrap}>
            <QRCode value={enrolment.uri} />
          </View>

          <Pressable onPress={copySecret} hitSlop={8}>
            <Text style={styles.action}>Can&apos;t scan? Copy the setup key</Text>
          </Pressable>

          <TextInput
            style={styles.input}
            placeholder="6-digit code"
            placeholderTextColor={t.textMuted}
            keyboardType="number-pad"
            value={code}
            onChangeText={setCode}
            maxLength={6}
          />

          <View style={styles.buttonRow}>
            <Pressable style={press(styles.primary)} onPress={confirmTotp} disabled={busy}>
              <Text style={styles.primaryText}>{busy ? "Checking..." : "Turn it on"}</Text>
            </Pressable>
            <Pressable
              style={press(styles.secondary)}
              onPress={() => {
                setEnrolment(null);
                setCode("");
              }}
              disabled={busy}
            >
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : hasTotp ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>On</Text>
              <Text style={styles.rowHint}>You enter a code when you sign in on a new device.</Text>
            </View>
          </View>
          <Pressable onPress={confirmDisableTotp} hitSlop={8}>
            <Text style={[styles.action, styles.actionDanger]}>Turn off</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable style={press(styles.card)} onPress={startTotp} disabled={busy}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Set up two-factor</Text>
              <Text style={styles.rowHint}>
                A code from an authenticator app, on top of your password.
              </Text>
            </View>
            {busy ? <ActivityIndicator /> : <Text style={styles.action}>Set up</Text>}
          </View>
        </Pressable>
      )}

      {/* ---- App lock ---- */}
      <Text style={styles.groupTitle}>App lock</Text>
      <View style={styles.card}>
        {lockCap?.available ? (
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>
                {lockCap.kind === "face"
                  ? "Require Face ID"
                  : lockCap.kind === "fingerprint"
                    ? "Require Touch ID"
                    : "Require unlock"}
              </Text>
              <Text style={styles.rowHint}>
                Ask for it each time the app opens, so a borrowed phone shows nothing.
              </Text>
            </View>
            <Switch
              value={lockOn}
              onValueChange={toggleLock}
              trackColor={{ true: t.accent, false: t.surfaceSunken }}
            />
          </View>
        ) : (
          <View style={styles.row}>
            <Text style={styles.rowHint}>
              {lockCap?.reason === "not-enrolled"
                ? "Set up Face ID or a passcode in your phone's settings first, and this appears here."
                : "This phone doesn't have Face ID or a fingerprint reader."}
            </Text>
          </View>
        )}
      </View>

      {/* ---- Sessions ---- */}
      <Text style={styles.groupTitle}>Sessions</Text>
      <Pressable style={press(styles.card)} onPress={signOutEverywhere}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Sign out everywhere else</Text>
            <Text style={styles.rowHint}>
              Ends every other session. Useful if you&apos;ve lost a phone.
            </Text>
          </View>
        </View>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
    container: {
      flexGrow: 1,
      backgroundColor: t.bg,
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(12),
    },
    groupTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: t.textMuted,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginTop: t.space(6),
      marginBottom: t.space(2),
      marginLeft: t.space(1),
    },
    card: { ...t.card, padding: t.space(5), gap: t.space(3) },
    row: { flexDirection: "row", alignItems: "center", gap: t.space(3) },
    rowLabel: { ...t.type.heading, color: t.textPrimary },
    rowHint: { ...t.type.caption, color: t.textSecondary, marginTop: 1 },
    action: { ...t.type.label, color: t.accent },
    actionDanger: { color: t.danger },
    qrWrap: { alignItems: "center", marginVertical: t.space(3) },
    input: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(3),
      ...t.type.body,
      color: t.textPrimary,
      letterSpacing: 4,
    },
    buttonRow: { flexDirection: "row", gap: t.space(3), marginTop: t.space(1) },
    primary: {
      backgroundColor: t.brand,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(3),
      paddingHorizontal: t.space(5),
    },
    primaryText: { ...t.type.label, color: t.textOnBrand },
    secondary: {
      borderRadius: t.radius.pill,
      paddingVertical: t.space(3),
      paddingHorizontal: t.space(5),
      borderWidth: 1,
      borderColor: t.border,
    },
    secondaryText: { ...t.type.label, color: t.textSecondary },
  });
