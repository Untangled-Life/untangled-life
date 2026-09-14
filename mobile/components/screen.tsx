import { ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";

/**
 * The top of a settings screen: back link, title, and a line saying what the
 * screen is for.
 *
 * Ten screens each wrote their own, and they disagreed about the label, the
 * size, the colour and the space beneath. None of that variation was a
 * decision.
 */
export function ScreenHeader({
  title,
  back = "Back",
  intro,
  onBack,
}: {
  title: string;
  /** Label after the chevron. Name the place you are going back TO. */
  back?: string;
  intro?: ReactNode;
  onBack?: () => void;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.header}>
      <Pressable
        onPress={onBack ?? (() => router.back())}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={`Back to ${back}`}
        style={press(styles.backTap)}
      >
        <Text style={styles.back}>{`‹ ${back}`}</Text>
      </Pressable>

      <Text style={styles.title}>{title}</Text>
      {intro ? <Text style={styles.intro}>{intro}</Text> : null}
    </View>
  );
}

/**
 * Nothing here yet, said in a way that suggests what to do about it.
 *
 * Sunken rather than raised: an empty state is a hole in the page, and drawing
 * it as a card promises content that isn't there.
 */
export function EmptyState({ children }: { children: ReactNode }) {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{children}</Text>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    header: { marginBottom: t.space(6) },
    backTap: { alignSelf: "flex-start", paddingVertical: t.space(2) },
    back: { ...t.type.label, color: t.accent },
    title: { ...t.type.display, color: t.textPrimary, marginTop: t.space(2) },
    intro: { ...t.type.body, color: t.textSecondary, marginTop: t.space(2) },
    empty: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(5),
    },
    emptyText: { ...t.type.body, color: t.textSecondary },
  });
