import { ReactNode } from "react";
import { StyleProp, StyleSheet, Text, View, ViewStyle } from "react-native";
import { Link } from "expo-router";
import { Theme } from "@/theme/tokens";
import { useThemedStyles } from "@/contexts/theme";

/**
 * The surfaces every screen is built from.
 *
 * Twenty-three files each defined their own `card`, and no two agreed: padding
 * of 16, 18 or 20, radius of md or lg, some with a shadow and some without,
 * headings at 15, 16 or 17px. None of it was a decision -- it was whatever the
 * file next to it happened to have. The result reads as slightly broken in a
 * way that is hard to point at, which is exactly the kind of thing a
 * screenshot on a marketing page shows up.
 *
 * One card, one section header, one eyebrow.
 */

export function Card({
  children,
  style,
  tone = "raised",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * raised -- the default, a piece of paper on the ground.
   * flat   -- an outlined panel for something secondary, no shadow.
   * sunken -- a well, for an empty state or a group of controls.
   */
  tone?: "raised" | "flat" | "sunken";
}) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.card, styles[tone], style]}>{children}</View>;
}

/**
 * The heading above a group, with an optional action on the right.
 *
 * The action is a Link rather than a Pressable because every one of these in
 * the app navigates, and a Link keeps the whole label tappable at its real
 * size instead of whatever a Text happens to occupy.
 */
export function SectionHeader({
  title,
  eyebrow,
  action,
  actions,
  style,
}: {
  title: string;
  eyebrow?: string;
  action?: { label: string; href: string };
  actions?: { label: string; href: string }[];
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useThemedStyles(createStyles);
  const links = actions ?? (action ? [action] : []);

  return (
    <View style={[styles.sectionHeader, style]}>
      <View style={styles.sectionTitleWrap}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>

      {links.length > 0 ? (
        <View style={styles.sectionActions}>
          {links.map((l) => (
            <Link key={l.href + l.label} href={l.href as never} style={styles.sectionAction}>
              {l.label}
            </Link>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** Small capitals above a group. Sets its own colour, so pass a style to change it. */
export function Eyebrow({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const styles = useThemedStyles(createStyles);
  return <Text style={[styles.eyebrow, style as never]}>{children}</Text>;
}

/** A hairline between rows inside a card, inset so it doesn't touch the edges. */
export function Divider({ inset = 0 }: { inset?: number }) {
  const styles = useThemedStyles(createStyles);
  return <View style={[styles.divider, inset ? { marginLeft: inset } : null]} />;
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    card: { padding: t.space(5) },
    // t.card is the ground, the edge and the lift together, so every raised
    // card in the app is the same object rather than the same intention.
    raised: { ...t.card },
    flat: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      borderWidth: 1,
      borderColor: t.border,
    },
    sunken: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
    },
    sectionHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      marginBottom: t.space(3),
    },
    sectionTitleWrap: { flex: 1, gap: t.space(1) },
    sectionTitle: { ...t.type.title, color: t.textPrimary },
    eyebrow: { ...t.type.eyebrow, color: t.textMuted },
    sectionActions: { flexDirection: "row", gap: t.space(4), paddingBottom: t.space(1) },
    sectionAction: { ...t.type.label, color: t.accent },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: t.border,
      marginVertical: t.space(3),
    },
  });
