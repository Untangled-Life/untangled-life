import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { tapped, warned } from "@/lib/haptics";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { usePartnerColors } from "@/hooks/usePartnerColors";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { PALETTE, shadeFor } from "@/lib/palette";
import { supabase } from "@/lib/supabase";

export default function Colors() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile, refreshProfile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const colors = usePartnerColors();

  const [saving, setSaving] = useState(false);

  const myName = me.display_name ?? "You";
  const partnerName = partner?.display_name ?? "Your partner";
  const chosen = profile?.color ?? null;

  // Their colour, so you can see what you'd be clashing with. Not selectable:
  // it's theirs to pick, and quietly changing it on their phone from yours is
  // the kind of thing that starts an argument about the app.
  const theirs = colors.theirs;

  // The swatch showing your partner's name reads as "not available", and then
  // tapping it silently made you both the same colour -- which defeats the
  // entire feature and leaves the calendar unreadable. Ask rather than
  // forbid: there may be a reason, and a hard block on a tappable-looking
  // control is its own kind of confusing.
  function confirmTaken(name: string) {
    Alert.alert(
      `That's ${partnerName}'s colour`,
      "You'd both be the same colour everywhere, and you wouldn't be able to tell whose anything is.",
      [
        { text: "Pick another", style: "cancel" },
        { text: "Use it anyway", style: "destructive", onPress: () => pick(name) },
      ]
    );
  }

  async function pick(name: string) {
    if (!session?.user.id || saving) return;
    tapped();
    setSaving(true);

    const { error } = await supabase
      .from("profiles")
      .update({ color: name })
      .eq("id", session.user.id);

    if (error) {
      warned();
      Alert.alert("Couldn't save that", error.message);
      setSaving(false);
      return;
    }

    await refreshProfile();
    setSaving(false);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Your colour</Text>
      <Text style={styles.intro}>
        Everything of yours is drawn in this: events, your busy time, your working hours. Both of
        you see the same scheme, so pick something {partnerName.toLowerCase() === "your partner" ? "your partner" : partnerName} isn&apos;t.
      </Text>

      <View style={styles.preview}>
        <View
          style={[
            styles.previewBlock,
            {
              backgroundColor: shadeFor(colors.mine, t.scheme).fill,
              borderLeftColor: shadeFor(colors.mine, t.scheme).chip,
            },
          ]}
        >
          <Text style={[styles.previewLabel, { color: shadeFor(colors.mine, t.scheme).ink }]}>
            {myName}
          </Text>
          <Text style={[styles.previewTime, { color: shadeFor(colors.mine, t.scheme).ink }]}>
            9:00 am · Dentist
          </Text>
        </View>

        {theirs ? (
          <View
            style={[
              styles.previewBlock,
              {
                backgroundColor: shadeFor(theirs, t.scheme).fill,
                borderLeftColor: shadeFor(theirs, t.scheme).chip,
              },
            ]}
          >
            <Text style={[styles.previewLabel, { color: shadeFor(theirs, t.scheme).ink }]}>
              {partnerName}
            </Text>
            <Text style={[styles.previewTime, { color: shadeFor(theirs, t.scheme).ink }]}>
              1:00 pm · Gym
            </Text>
          </View>
        ) : null}
      </View>

      <View style={styles.swatches}>
        {PALETTE.map((color) => {
          const shade = shadeFor(color, t.scheme);
          const active = chosen === color.name;
          const taken = theirs?.name === color.name;

          return (
            <Pressable
              key={color.name}
              onPress={() => (taken ? confirmTaken(color.name) : pick(color.name))}
              style={press(styles.swatchWrap)}
              accessibilityRole="button"
              accessibilityLabel={taken ? `${color.label}, ${partnerName}'s colour` : color.label}
              accessibilityState={{ selected: active }}
            >
              <View
                style={[
                  styles.swatch,
                  { backgroundColor: shade.chip },
                  active ? { borderColor: t.textPrimary } : null,
                ]}
              >
                {/* The tick is drawn in the colour's own ink, not white: white
                    on a pastel swatch fails contrast on all 24 in light mode
                    and on 13 of them in dark, so the only thing marking your
                    choice was the border ring. */}
                {active ? <Text style={[styles.tick, { color: shade.ink }]}>✓</Text> : null}
              </View>
              <Text style={[styles.swatchLabel, active ? styles.swatchLabelOn : null]}>
                {taken ? partnerName.split(" ")[0] : color.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        Shared events, the ones marked &quot;Us&quot;, stay in the app&apos;s own orange, so it
        is always clear which things belong to both of you.
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
    title: { ...t.type.display, color: t.textPrimary, marginBottom: t.space(2) },
    intro: { fontSize: 14, lineHeight: 21, color: t.textSecondary, marginBottom: t.space(5) },
    preview: { gap: t.space(2), marginBottom: t.space(6) },
    previewBlock: {
      borderRadius: t.radius.sm,
      borderLeftWidth: 3,
      paddingHorizontal: t.space(3),
      paddingVertical: t.space(2),
    },
    previewLabel: { fontSize: 12, fontWeight: "700" },
    previewTime: { fontSize: 11, marginTop: 1 },
    swatches: { flexDirection: "row", flexWrap: "wrap", gap: t.space(3), justifyContent: "flex-start" },
    swatchWrap: { alignItems: "center", width: "21%" },
    swatch: {
      width: 44,
      height: 44,
      borderRadius: 22,
      borderWidth: 2,
      borderColor: "transparent",
      alignItems: "center",
      justifyContent: "center",
    },
    tick: { fontSize: 18, fontWeight: "700" },
    swatchLabel: { fontSize: 10, color: t.textMuted, marginTop: 5, textAlign: "center" },
    swatchLabelOn: { color: t.textPrimary, fontWeight: "700" },
    footnote: { fontSize: 12, lineHeight: 18, color: t.textMuted, marginTop: t.space(6) },
  });
