import { ReactNode } from "react";
import { Pressable, StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";

/**
 * The pieces every screen is assembled from.
 *
 * Ten screens each wrote their own back link, and they disagreed about the
 * label, the size, the colour and the space beneath it. Six wrote their own
 * chip. Four wrote their own row. None of that variation was a decision, and
 * the sum of it is an app that feels like it was built by several people who
 * never spoke -- which, in a sense, it was.
 */

/** Back link, title, and an optional line explaining what the screen is for. */
export function ScreenHeader({
  title,
  back = "Back",
  intro,
  onBack,
  trailing,
}: {
  title: string;
  /** Label after the chevron. Name the place you are going back TO. */
  back?: string | null;
  intro?: string;
  onBack?: () => void;
  /** An action sitting on the title's right, such as Save. */
  trailing?: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.header}>
      {back === null ? null : (
        <Pressable
          onPress={onBack ?? (() => router.back())}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${back}`}
          style={press(styles.backTap)}
        >
          <Text style={styles.back}>{`‹ ${back}`}</Text>
        </Pressable>
      )}

      <View style={styles.titleRow}>
        <Text style={styles.title}>{title}</Text>
        {trailing}
      </View>

      {intro ? <Text style={styles.intro}>{intro}</Text> : null}
    </View>
  );
}

/**
 * A pill that is either on or off.
 *
 * `tone` picks what "on" means: accent for a choice among equals, brand for
 * the one that changes what the screen is showing.
 */
export function Chip({
  label,
  on,
  onPress,
  tone = "accent",
  grow = false,
  style,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  tone?: "accent" | "brand";
  /** Share the row equally with its siblings, for a segmented control. */
  grow?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      style={press([
        styles.chip,
        grow ? styles.chipGrow : null,
        on ? (tone === "brand" ? styles.chipOnBrand : styles.chipOn) : null,
        style,
      ])}
    >
      <Text
        style={[
          styles.chipText,
          on ? (tone === "brand" ? styles.chipTextOnBrand : styles.chipTextOn) : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * A row in a list: something on the left, a title and an optional second line,
 * something on the right.
 *
 * The divider is drawn on the row rather than between rows so a list can be
 * built by mapping without the caller tracking which one is last.
 */
export function Row({
  title,
  detail,
  leading,
  trailing,
  onPress,
  first = false,
  danger = false,
  titleStyle,
}: {
  title: string;
  detail?: string | null;
  leading?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  /** Suppresses the divider, for the first row in a group. */
  first?: boolean;
  danger?: boolean;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const styles = useThemedStyles(createStyles);

  const content = (
    <>
      {leading}
      <View style={styles.rowText}>
        <Text style={[styles.rowTitle, danger ? styles.rowDanger : null, titleStyle]}>{title}</Text>
        {detail ? <Text style={styles.rowDetail}>{detail}</Text> : null}
      </View>
      {trailing}
    </>
  );

  if (!onPress) {
    return <View style={[styles.row, first ? null : styles.rowDivider]}>{content}</View>;
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        first ? null : styles.rowDivider,
        pressed ? styles.rowPressed : null,
      ]}
    >
      {content}
    </Pressable>
  );
}

/** A chevron for a row that goes somewhere. */
export function RowChevron() {
  const styles = useThemedStyles(createStyles);
  return <Text style={styles.chevron}>{"›"}</Text>;
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
    backTap: { alignSelf: "flex-start", paddingVertical: t.space(1) },
    back: { ...t.type.label, color: t.accent },
    titleRow: {
      flexDirection: "row",
      alignItems: "flex-end",
      justifyContent: "space-between",
      gap: t.space(3),
      marginTop: t.space(2),
    },
    title: { ...t.type.display, color: t.textPrimary, flexShrink: 1 },
    intro: { ...t.type.body, color: t.textSecondary, marginTop: t.space(2) },

    chip: {
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(2),
      borderRadius: t.radius.pill,
      backgroundColor: t.surfaceSunken,
      alignItems: "center",
    },
    chipGrow: { flex: 1 },
    chipOn: { backgroundColor: t.accentSoft },
    chipOnBrand: { backgroundColor: t.brand },
    chipText: { ...t.type.label, color: t.textSecondary },
    chipTextOn: { color: t.accent },
    chipTextOnBrand: { color: t.textOnBrand },

    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
      paddingVertical: t.space(4),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    rowPressed: { opacity: 0.55 },
    rowText: { flex: 1, gap: 2 },
    rowTitle: { ...t.type.heading, color: t.textPrimary },
    rowDanger: { color: t.danger },
    rowDetail: { ...t.type.caption, color: t.textSecondary },
    chevron: { fontSize: 20, color: t.textMuted },

    empty: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(5),
    },
    emptyText: { ...t.type.body, color: t.textSecondary },
  });
