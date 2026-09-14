import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { press } from "@/components/press";
import { router } from "expo-router";
import { useThemedStyles, useTheme, useThemeMode } from "@/contexts/theme";
import { Theme, ThemeMode } from "@/theme/tokens";
import { ChevronRightIcon } from "@/components/icons";

const MODES: { key: ThemeMode; label: string; blurb: string }[] = [
  { key: "system", label: "Match my phone", blurb: "Follows your phone's light or dark setting." },
  { key: "light", label: "Always light", blurb: "Keep the app light whatever the phone does." },
  { key: "dark", label: "Always dark", blurb: "Keep the app dark whatever the phone does." },
];

export default function Settings() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { mode, setMode, scheme } = useThemeMode();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Menu</Text>
      </Pressable>

      <Text style={styles.title}>Settings</Text>

      <Text style={styles.groupTitle}>Appearance</Text>
      <View style={styles.card}>
        {MODES.map((m, i) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key)}
            style={press([styles.row, i > 0 ? styles.rowDivider : null])}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowLabel, mode === m.key ? styles.rowLabelActive : null]}>
                {m.label}
              </Text>
              <Text style={styles.rowHint}>{m.blurb}</Text>
            </View>
            {mode === m.key ? <Text style={styles.tick}>✓</Text> : null}
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>
        Currently showing the {scheme} theme.
        {mode === "system" ? " Change your phone's appearance setting to switch." : ""}
      </Text>

      <Text style={styles.groupTitle}>Account</Text>
      <Pressable style={press(styles.card)} onPress={() => router.push("/calendars")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Calendars</Text>
            <Text style={styles.rowHint}>Which ones your partner can see</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>

      <Pressable style={press(styles.card)} onPress={() => router.push("/work-hours")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Working hours</Text>
            <Text style={styles.rowHint}>Your shifts, so free time is honest</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>

      <Text style={styles.footnote}>
        More will land here before launch — see the pre-launch checklist in the repo for what&apos;s
        still outstanding.
      </Text>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      flexGrow: 1,
      backgroundColor: t.bg,
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(12),
    },
    back: { fontSize: 15, color: t.accent, fontWeight: "600", marginBottom: t.space(3) },
    title: { fontSize: 28, fontWeight: "700", color: t.textPrimary, marginBottom: t.space(6) },
    groupTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: t.textMuted,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: t.space(2),
      marginTop: t.space(4),
      marginLeft: t.space(1),
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      overflow: "hidden",
      marginBottom: t.space(3),
      ...t.shadow,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: t.space(4),
      paddingHorizontal: t.space(4),
      gap: t.space(3),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    rowLabel: { fontSize: 15, fontWeight: "500", color: t.textPrimary },
    rowLabelActive: { color: t.accent, fontWeight: "700" },
    rowHint: { fontSize: 12, color: t.textMuted, marginTop: 2 },
    tick: { color: t.accent, fontSize: 17, fontWeight: "700" },
    footnote: {
      fontSize: 12,
      color: t.textMuted,
      lineHeight: 18,
      marginTop: t.space(3),
      marginLeft: t.space(1),
    },
  });
