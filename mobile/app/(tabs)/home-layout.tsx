import { useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Switch, Alert } from "react-native";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { tapped, warned } from "@/lib/haptics";
import { useAuth } from "@/contexts/auth";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import {
  HOME_SECTIONS,
  HomeLayout,
  HomeSection,
  moveSection,
  resolveHomeLayout,
  serializeHomeLayout,
  toggleSection,
  visibleSections,
} from "@/lib/homeLayout";

const LABELS = new Map(HOME_SECTIONS.map((s) => [s.key, s]));

export default function HomeLayoutSettings() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile, refreshProfile } = useAuth();

  const [layout, setLayout] = useState<HomeLayout>(() =>
    resolveHomeLayout(profile?.home_sections)
  );

  async function apply(next: HomeLayout) {
    if (!session?.user.id) return;
    tapped();

    const previous = layout;
    setLayout(next);

    const { error } = await supabase
      .from("profiles")
      .update({ home_sections: serializeHomeLayout(next) })
      .eq("id", session.user.id);

    if (error) {
      setLayout(previous);
      warned();
      Alert.alert("Couldn't save that", error.message);
      return;
    }

    // Home reads its arrangement off the profile, so it needs the new one.
    await refreshProfile();
  }

  const shown = visibleSections(layout);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title="Arrange Home"
        intro={
          <>
          Put the sections in the order you want them and switch off the ones you don&apos;t use.
          This is yours alone. Your partner keeps their own arrangement.
          </>
        }
      />

      <View style={styles.card}>
        {layout.order.map((key, index) => {
          const meta = LABELS.get(key);
          const hidden = layout.hidden.has(key);

          return (
            <View key={key} style={[styles.row, index > 0 ? styles.rowDivider : null]}>
              <View style={styles.arrows}>
                <Pressable
                  onPress={() => apply(moveSection(layout, key, -1))}
                  disabled={index === 0}
                  hitSlop={6}
                  accessibilityLabel={`Move ${meta?.label} up`}
                >
                  <Text style={[styles.arrow, index === 0 ? styles.arrowOff : null]}>▲</Text>
                </Pressable>
                <Pressable
                  onPress={() => apply(moveSection(layout, key, 1))}
                  disabled={index === layout.order.length - 1}
                  hitSlop={6}
                  accessibilityLabel={`Move ${meta?.label} down`}
                >
                  <Text
                    style={[
                      styles.arrow,
                      index === layout.order.length - 1 ? styles.arrowOff : null,
                    ]}
                  >
                    ▼
                  </Text>
                </Pressable>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.rowLabel, hidden ? styles.rowLabelOff : null]}>
                  {meta?.label ?? key}
                </Text>
                <Text style={styles.rowHint}>{meta?.blurb}</Text>
              </View>

              <Switch
                value={!hidden}
                onValueChange={() => apply(toggleSection(layout, key))}
                trackColor={{ true: t.brand, false: t.surfaceSunken }}
              />
            </View>
          );
        })}
      </View>

      <Text style={styles.footnote}>
        {shown.length === 0
          ? "Everything is switched off, so Home will show just your photo and the setup prompts. That's allowed. Switch something back on whenever you like."
          : "A section with nothing in it still hides itself. Switching one off here keeps it hidden even when there's something to show."}
      </Text>

      {/* Reordering a hidden section is allowed on purpose: it holds its place,
          so switching it back on puts it where you left it rather than at the
          bottom. */}
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
    card: {
      ...t.card,
      paddingHorizontal: t.space(4)
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
      paddingVertical: t.space(3),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    arrows: { width: 28, alignItems: "center", gap: 2 },
    arrow: { ...t.type.caption, color: t.accent },
    arrowOff: { color: t.surfaceSunken },
    rowLabel: { ...t.type.heading, color: t.textPrimary },
    rowLabelOff: { color: t.textMuted },
    rowHint: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
    footnote: { ...t.type.caption, color: t.textMuted, marginTop: t.space(4) },
  });
