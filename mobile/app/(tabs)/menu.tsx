import { useState } from "react";
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
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useAuth } from "@/contexts/auth";
import { useMyAvatar } from "@/hooks/useMyAvatar";
import { Avatar } from "@/components/avatar";
import { ActionSheet } from "@/components/action-sheet";
import { tapped } from "@/lib/haptics";

type IconProps = { size?: number; color?: string };

type Item = {
  label: string;
  hint?: string;
  icon: (p: IconProps) => React.ReactElement;
  onPress: () => void;
};

export default function Menu() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { partner } = useCoupleMembers();
  const { profile, signOut } = useAuth();
  const { avatarUrl, busy, changePhoto, confirmRemove } = useMyAvatar();
  const [photoMenu, setPhotoMenu] = useState(false);

  // Nothing here pretends to work. Anything without a real destination says so
  // rather than opening an empty screen -- the outstanding ones are tracked in
  // launch/pre-launch-checklist.md.
  const notReady = (what: string, why: string) =>
    Alert.alert(what, why, [{ text: "OK" }]);

  const groups: { title: string; items: Item[] }[] = [
    {
      title: "Your couple",
      items: [
        ...(partner
          ? []
          : [
              {
                label: "Invite your partner",
                hint: "Everything you have already put in comes with you",
                icon: (p: IconProps) => <HeartIcon {...p} />,
                onPress: () => router.push("/pair"),
              },
            ]),
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
          hint: "Calendars, hours, your account",
          icon: (p) => <CogIcon {...p} />,
          onPress: () => router.push("/settings"),
        },
        ...(partner
          ? [
              {
                label: "Feeling valued",
                hint: "What makes each of you feel wanted",
                icon: (p: IconProps) => <HeartIcon {...p} />,
                onPress: () => router.push("/valued"),
              },
            ]
          : []),
        {
          label: "Personalisation",
          hint: "Appearance, colours, your Home screen",
          icon: (p) => <SlidersIcon {...p} />,
          onPress: () => router.push("/personalisation"),
        },
        {
          label: "Notification settings",
          hint: "Not built yet",
          icon: (p) => <BellIcon {...p} />,
          onPress: () =>
            notReady(
              "Notification settings",
              "Reminders for important dates currently fire 2 weeks, 1 week and 3 days before each date, and can't be changed in-app yet. Turn them off entirely in your phone's Settings if you need to."
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
          // Apple checks that the terms are reachable from inside the app, not
          // only from the store listing.
          label: "Terms of service",
          icon: (p) => <ShieldIcon {...p} />,
          onPress: () => Linking.openURL("https://untangledlife.com.au/terms"),
        },
        {
          label: "Follow us",
          hint: "Coming soon",
          icon: (p) => <HeartIcon {...p} />,
          onPress: () =>
            notReady("Follow us", "No Facebook or Instagram accounts yet. These will link up once they exist."),
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
        {/* Your own face, where the menu opens. It is the one place in the
            app that is about you rather than about the two of you, and a
            photo you can see is a photo you remember to set -- buried on the
            Settings screen it stayed empty, and an empty circle beside your
            partner's face on every event is a worse first impression than
            any screen here. */}
        <Pressable
          onPress={() => {
            tapped();
            setPhotoMenu(true);
          }}
          hitSlop={8}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={avatarUrl ? "Change your photo" : "Add your photo"}
          style={press(styles.avatar)}
        >
          <Avatar url={avatarUrl} name={profile?.display_name ?? null} size={44} />
        </Pressable>

        <Text style={styles.title}>Menu</Text>

        <Pressable onPress={() => router.back()} hitSlop={12} style={press(styles.close)}>
          <CloseIcon size={22} color={t.textSecondary} />
        </Pressable>
      </View>

      <ActionSheet
        visible={photoMenu}
        title="Your photo"
        subtitle={
          avatarUrl
            ? "Your partner sees this beside your events."
            : "Your initials show until there is one."
        }
        actions={
          avatarUrl
            ? [
                { label: "Change photo", onPress: changePhoto },
                { label: "Remove photo", destructive: true, onPress: confirmRemove },
              ]
            : [{ label: "Add a photo", onPress: changePhoto }]
        }
        onClose={() => setPhotoMenu(false)}
        onDismissed={() => setPhotoMenu(false)}
      />

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

        {/* Last, under everything, in the one place people go looking for
            it. It used to sit at the foot of Home, which is a screen you
            scroll for the countdowns -- so the thing you press once a year by
            accident was at the end of the thing you open every day. */}
        <Pressable style={press(styles.signOut)} onPress={() => signOut()}>
          <Text style={styles.signOutText}>
            Signed in as {profile?.display_name ?? "you"}. Sign out
          </Text>
        </Pressable>

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
      gap: t.space(3),
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(3),
    },
    // The ring is what keeps a face legible against whatever is behind it,
    // and it is the same one the hero draws.
    avatar: {
      borderRadius: 999,
      borderWidth: 2.5,
      borderColor: t.surface,
      ...t.shadow,
    },
    // Takes the middle, so the close button stays hard against the edge
    // rather than drifting in when the name is short.
    title: { ...t.type.display, color: t.textPrimary, flex: 1 },
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
      ...t.card,
      overflow: "hidden"
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
    rowLabel: { ...t.type.heading, color: t.textPrimary },
    rowHint: { ...t.type.caption, color: t.textMuted, marginTop: 1 },
    signOut: {
      marginTop: t.space(8),
      paddingVertical: t.space(3),
      alignItems: "center",
    },
    signOutText: { ...t.type.caption, color: t.textMuted },
    version: {
      textAlign: "center",
      color: t.textMuted,
      ...t.type.caption,
      marginTop: t.space(4),
    },
  });
