import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Calendar from "expo-calendar/legacy";
import { router } from "expo-router";
import { press } from "@/components/press";
import { tapped, warned } from "@/lib/haptics";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import {
  DeviceCalendar,
  listCalendars,
  setCalendarConnected,
  declineUndecided,
} from "@/lib/calendarPrefs";
import { syncBusyBlocks } from "@/lib/calendarSync";

export default function Calendars() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile } = useAuth();
  const { partner } = useCoupleMembers();

  const [calendars, setCalendars] = useState<DeviceCalendar[]>([]);
  const [permission, setPermission] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const partnerName = partner?.display_name ?? "your partner";

  const load = useCallback(async () => {
    if (!session?.user.id) return;
    const result = await Calendar.getCalendarPermissionsAsync();
    setPermission(result.status);
    setCalendars(result.status === "granted" ? await listCalendars(session.user.id) : []);
    setLoaded(true);
  }, [session?.user.id]);

  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function requestAccess() {
    const result = await Calendar.requestCalendarPermissionsAsync();
    setPermission(result.status);
    if (result.status === "granted") load();
  }

  async function toggle(calendar: DeviceCalendar, next: boolean) {
    if (!session?.user.id || !profile?.couple_id) return;
    tapped();
    setBusyId(calendar.id);

    // Optimistic: a switch that waits on the network before moving feels
    // broken, and the write is a single upsert.
    setCalendars((cs) =>
      cs.map((c) => (c.id === calendar.id ? { ...c, connected: next, undecided: false } : c))
    );

    const { error } = await setCalendarConnected(session.user.id, calendar, next);

    if (error) {
      warned();
      setCalendars((cs) =>
        cs.map((c) => (c.id === calendar.id ? { ...c, connected: !next } : c))
      );
      Alert.alert("Couldn't save that", error);
      setBusyId(null);
      return;
    }

    // Re-read straight away so the change is visible on the shared calendar
    // now, rather than whenever Home next happens to sync.
    await syncBusyBlocks(profile.couple_id, session.user.id);
    setBusyId(null);
  }

  async function goBack() {
    // Leaving without answering is an answer. Recording it stops the app
    // asking again about calendars you've already scrolled past and left off.
    if (session?.user.id) await declineUndecided(session.user.id, calendars);
    router.back();
  }

  const connectedCount = calendars.filter((c) => c.connected).length;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      }
    >
      <Pressable onPress={goBack} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Calendars</Text>
      <Text style={styles.intro}>
        Pick which calendars Untangled Life reads. Events in a connected calendar — including their
        titles, locations and notes — appear on your shared calendar, where {partnerName} can read
        them. Anything you leave off never leaves this phone.
      </Text>

      {permission !== "granted" ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Calendar access is off</Text>
          <Text style={styles.emptyText}>
            Your phone has to let the app see your calendars before you can choose between them.
            Nothing is read or uploaded until you connect a calendar below.
          </Text>
          <Pressable style={press(styles.button)} onPress={requestAccess}>
            <Text style={styles.buttonText}>Allow calendar access</Text>
          </Pressable>
        </View>
      ) : !loaded ? (
        <ActivityIndicator style={{ marginTop: t.space(8) }} />
      ) : calendars.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>No calendars on this phone</Text>
          <Text style={styles.emptyText}>
            Add an account in your phone&apos;s calendar settings and pull down to refresh.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            {calendars.map((c, i) => (
              <View key={c.id} style={[styles.row, i > 0 ? styles.rowDivider : null]}>
                <View style={[styles.swatch, { backgroundColor: c.color ?? t.textMuted }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{c.title}</Text>
                  {c.sourceName ? <Text style={styles.rowHint}>{c.sourceName}</Text> : null}
                </View>
                {busyId === c.id ? (
                  <ActivityIndicator />
                ) : (
                  <Switch
                    value={c.connected}
                    onValueChange={(next) => toggle(c, next)}
                    trackColor={{ true: t.brand, false: t.surfaceSunken }}
                  />
                )}
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            {connectedCount === 0
              ? "Nothing is connected, so nothing from your calendar is shared — and the app can't work out when you're free. Connect at least the calendar your commitments live in."
              : connectedCount === 1
                ? "1 calendar connected. Switching one off deletes the events it added straight away."
                : `${connectedCount} calendars connected. Switching one off deletes the events it added straight away.`}
          </Text>
        </>
      )}
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
    title: { fontSize: 28, fontWeight: "700", color: t.textPrimary, marginBottom: t.space(2) },
    intro: {
      fontSize: 14,
      lineHeight: 21,
      color: t.textSecondary,
      marginBottom: t.space(6),
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space(4),
      ...t.shadow,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
      paddingVertical: t.space(4),
    },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    swatch: { width: 10, height: 10, borderRadius: 5 },
    rowLabel: { fontSize: 15, fontWeight: "500", color: t.textPrimary },
    rowHint: { fontSize: 12, color: t.textMuted, marginTop: 2 },
    emptyTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: t.textPrimary,
      marginTop: t.space(4),
    },
    emptyText: {
      fontSize: 13,
      lineHeight: 19,
      color: t.textSecondary,
      marginTop: t.space(2),
      marginBottom: t.space(4),
    },
    button: {
      backgroundColor: t.brand,
      borderRadius: t.radius.md,
      paddingVertical: t.space(3),
      alignItems: "center",
      marginBottom: t.space(4),
    },
    buttonText: { color: "#fff", fontSize: 15, fontWeight: "600" },
    footnote: {
      fontSize: 12,
      lineHeight: 18,
      color: t.textMuted,
      marginTop: t.space(4),
    },
  });
