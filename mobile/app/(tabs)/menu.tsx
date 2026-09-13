import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Linking } from "react-native";
import { press } from "@/components/press";
import { router } from "expo-router";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import {
  CloseIcon,
  CogIcon,
  SlidersIcon,
  BellIcon,
  ShieldIcon,
  StarIcon,
  HeartIcon,
  CalendarIcon,
  ClockIcon,
  ChevronRightIcon,
} from "@/components/icons";

type Item = {
  label: string;
  hint?: string;
  icon: (p: { size?: number; color?: string }) => React.ReactElement;
  onPress: () => void;
};

export default function Menu() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  // Nothing here pretends to work. Anything without a real destination says so
  // rather than opening an empty screen — the outstanding ones are tracked in
  // launch/pre-launch-checklist.md.
  const notReady = (what: string, why: string) =>
    Alert.alert(what, why, [{ text: "OK" }]);

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Your couple",
      items: [
        {
          label: "Shared calendar",
          icon: (p) => <CalendarIcon {...p} />,
          onPress: () => router.push("/calendar"),
        },
        {
          label: "Working hours",
          icon: (p) => <ClockIcon {...p} />,
          onPress: () => router.push("/work-hours"),
        },
      ],
    },
    {
      title: "App",
      items: [
        {
          label: "Settings",
          hint: "Appearance and more",
          icon: (p) => <CogIcon {...p} />,
          onPress: () => router.push("/settings"),
        },
        {
          label: "Personalisation",
          hint: "Not built yet",
          icon: (p) => <SlidersIcon {...p} />,
          onPress: () =>
            notReady(
              "Personalisation",
              "Nothing to change here yet. It'll cover how the app addresses you both and what shows on your home screen."
            ),
        },
        {
          label: "Notification settings",
          hint: "Not built yet",
          icon: (p) => <BellIcon {...p} />,
          onPress: () =>
            notReady(
              "Notification settings",
              "Key-date reminders currently fire 2 weeks, 1 week and 3 days before each date, and can't be changed in-app yet. Turn them off entirely in your phone's Settings if you need to."
            ),
        },
      ],
    },
    {
      title: "Untangled Life",
      items: [
        {
          label: "Privacy policy",
          icon: (p) => <ShieldIcon {...p} />,
          onPress: () => Linking.openURL("https://untangledlife.com.au/privacy"),
        },
        {
          label: "Follow us",
          hint: "Coming soon",
          icon: (p) => <HeartIcon {...p} />,
          onPress: () =>
            notReady("Follow us", "No Facebook or Instagram accounts yet — these will link up once they exist."),
        },
        {
          label: "Give us 5 stars",
          hint: "Once we're in the store",
          icon: (p) => <StarIcon {...p} />,
          onPress: () =>
            notReady(
              "Rate Untangled Life",
              "The app isn't in the App Store yet, so there's nothing to rate. This'll open the store listing once it's live."
            ),
        },
        {
          label: "untangledlife.com.au",
          icon: (p) => <CalendarIcon {...p} />,
          onPress: () => Linking.openURL("https://untangledlife.com.au"),
        },
      ],
    },
  ];

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Menu</Text>
        <Pressable onPress={() => router.back()} hitSlop={12} style={press(styles.close)}>
          <CloseIcon size={22} color={t.textSecondary} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        {groups.map((group) => (
          <View key={group.title} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            <View style={styles.card}>
              {group.items.map((item, i) => (
                <Pressable
                  key={item.label}
                  onPress={item.onPress}
                  style={({ pressed }) => [
                    styles.row,
                    i > 0 ? styles.rowDivider : null,
                    pressed ? styles.rowPressed : null,
                  ]}
                >
                  <View style={styles.rowIcon}>{item.icon({ size: 20, color: t.accent })}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{item.label}</Text>
                    {item.hint ? <Text style={styles.rowHint}>{item.hint}</Text> : null}
                  </View>
                  <ChevronRightIcon size={18} color={t.textMuted} />
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.version}>Untangled Life · early build</Text>
      </ScrollView>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(3),
    },
    title: { fontSize: 28, fontWeight: "700", color: t.textPrimary },
    close: {
      width: 40,
      height: 40,
      borderRadius: t.radius.pill,
      backgroundColor: t.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    body: { paddingHorizontal: t.space(6), paddingBottom: t.space(12) },
    group: { marginTop: t.space(6) },
    groupTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: t.textMuted,
      letterSpacing: 0.8,
      textTransform: "uppercase",
      marginBottom: t.space(2),
      marginLeft: t.space(1),
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      overflow: "hidden",
      ...t.shadow,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
      paddingVertical: t.space(4),
      paddingHorizontal: t.space(4),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    rowPressed: { backgroundColor: t.surfaceSunken },
    rowIcon: {
      width: 36,
      height: 36,
      borderRadius: t.radius.md,
      backgroundColor: t.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    rowLabel: { fontSize: 15, fontWeight: "500", color: t.textPrimary },
    rowHint: { fontSize: 12, color: t.textMuted, marginTop: 1 },
    version: {
      textAlign: "center",
      color: t.textMuted,
      fontSize: 12,
      marginTop: t.space(8),
    },
  });
