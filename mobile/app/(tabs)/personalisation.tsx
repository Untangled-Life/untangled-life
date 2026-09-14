import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { ChevronRightIcon } from "@/components/icons";
import { useThemedStyles, useTheme, useThemeMode } from "@/contexts/theme";
import { Theme, ThemeMode, ACCENTS } from "@/theme/tokens";
import { tapped } from "@/lib/haptics";

/**
 * How the app looks.
 *
 * Split out of Settings, which had grown into one scroll holding your photo,
 * the theme, the accent, your calendar colour, the Home arrangement, three
 * other screens' worth of links, and account deletion. "Change the accent" and
 * "delete my account" do not belong on the same page, and a screen that holds
 * both is one you scroll past rather than read.
 *
 * The split is how it LOOKS against how it WORKS. Anything that changes what
 * the app does -- which calendars are read, which hours count, pairing,
 * leaving -- stays in Settings.
 */

const MODES: { key: ThemeMode; label: string; blurb: string }[] = [
  { key: "system", label: "Match my phone", blurb: "Follows your phone's light or dark setting." },
  { key: "light", label: "Always light", blurb: "Keep the app light whatever the phone does." },
  { key: "dark", label: "Always dark", blurb: "Keep the app dark whatever the phone does." },
];

export default function Personalisation() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { mode, setMode, scheme, accent, setAccent } = useThemeMode();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title="Personalisation"
        back="Menu"
        intro="How the app looks. What it does lives in Settings."
      />

      <Text style={styles.groupTitle}>Appearance</Text>
      <View style={styles.card}>
        {MODES.map((m, i) => (
          <Pressable
            key={m.key}
            onPress={() => setMode(m.key)}
            style={press([styles.row, i > 0 ? styles.rowDivider : null])}
            accessibilityRole="button"
            accessibilityState={{ selected: mode === m.key }}
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

      <Text style={styles.groupTitle}>Accent colour</Text>
      <View style={[styles.card, styles.swatchCard]}>
        {ACCENTS.map((a) => {
          const on = a.name === accent;
          const pair = scheme === "dark" ? a.dark : a.light;
          return (
            <Pressable
              key={a.name}
              onPress={() => {
                tapped();
                setAccent(a.name);
              }}
              style={press(styles.swatchWrap)}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              accessibilityState={{ selected: on }}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: pair.on },
                  on ? { borderColor: t.textPrimary } : null,
                ]}
              >
                {on ? <Text style={styles.swatchTick}>✓</Text> : null}
              </View>
              <Text style={[styles.swatchLabel, on ? styles.rowLabelActive : null]}>{a.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.footnote}>
        Changes links, buttons and key dates. The brand orange stays put.
      </Text>

      <Text style={styles.groupTitle}>Calendar colour</Text>
      <Pressable style={press(styles.card)} onPress={() => router.push("/colors")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Your colour</Text>
            <Text style={styles.rowHint}>How your events look on the shared calendar</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>
      <Text style={styles.footnote}>
        Shared with your partner, so you both see the same scheme.
      </Text>

      <Text style={styles.groupTitle}>Home screen</Text>
      <Pressable style={press(styles.card)} onPress={() => router.push("/home-layout")}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Arrange Home</Text>
            <Text style={styles.rowHint}>Reorder the sections, hide what you don&apos;t use</Text>
          </View>
          <ChevronRightIcon size={18} color={t.textMuted} />
        </View>
      </Pressable>
      <Text style={styles.footnote}>
        Yours alone. Your partner arranges theirs however they like.
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
    groupTitle: {
      ...t.type.eyebrow,
      color: t.textMuted,
      marginBottom: t.space(2),
      marginTop: t.space(5),
      marginLeft: t.space(1),
    },
    card: { ...t.card, overflow: "hidden" },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: t.space(4),
      paddingHorizontal: t.space(4),
      gap: t.space(3),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    rowLabel: { ...t.type.heading, color: t.textPrimary },
    rowLabelActive: { color: t.accent, fontWeight: "700" },
    rowHint: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
    tick: { color: t.accent, fontSize: 17, fontWeight: "700" },
    swatchCard: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      padding: t.space(4),
      gap: t.space(3),
    },
    swatchWrap: { alignItems: "center", width: "28%" },
    swatch: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    swatchTick: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
    swatchLabel: { ...t.type.caption, color: t.textMuted, marginTop: 6 },
    footnote: {
      ...t.type.caption,
      color: t.textMuted,
      marginTop: t.space(2),
      marginLeft: t.space(1),
    },
  });
