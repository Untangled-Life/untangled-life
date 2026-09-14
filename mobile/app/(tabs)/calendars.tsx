import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import * as Calendar from "expo-calendar/legacy";
import { router } from "expo-router";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { tapped, warned } from "@/lib/haptics";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import {
  DeviceCalendar,
  ShareLevel,
  SHARE_LEVELS,
  listCalendars,
  setShareLevel,
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

  async function choose(calendar: DeviceCalendar, next: ShareLevel) {
    // busyId is a guard, not just a spinner. Two quick taps used to run two
    // syncs concurrently: the first reads the old setting, the second writes
    // and re-syncs, then the first finishes on its stale read and deletes what
    // the second just inserted. The control would end up saying "Full detail"
    // over an empty table, with nothing to reconcile it.
    if (busyId !== null) return;
    if (!session?.user.id || next === calendar.shareLevel) return;
    tapped();
    setBusyId(calendar.id);

    // Optimistic: a control that waits on the network before moving feels
    // broken, and the write is a single upsert.
    const previous = calendar.shareLevel;
    setCalendars((cs) =>
      cs.map((c) => (c.id === calendar.id ? { ...c, shareLevel: next, undecided: false } : c))
    );

    const { error } = await setShareLevel(session.user.id, calendar, next);

    if (error) {
      warned();
      setCalendars((cs) =>
        cs.map((c) => (c.id === calendar.id ? { ...c, shareLevel: previous } : c))
      );
      Alert.alert("Couldn't save that", error);
      setBusyId(null);
      return;
    }

    // Re-read straight away so the change is visible on the shared calendar
    // now, rather than whenever Home next happens to sync.
    if (profile?.couple_id) await syncBusyBlocks(profile.couple_id, session.user.id);
    setBusyId(null);
  }

  async function goBack() {
    // Leaving without answering is an answer. Recording it stops the app
    // asking again about calendars you've already scrolled past and left off.
    if (session?.user.id) await declineUndecided(session.user.id, calendars);
    router.back();
  }

  const sharedCount = calendars.filter((c) => c.shareLevel !== "off").length;
  const detailedCount = calendars.filter((c) => c.shareLevel === "details").length;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      }
    >
      <ScreenHeader
        title="Calendars"
        onBack={goBack}
        intro={
          <>
          Pick what {partnerName} sees of each calendar. <Text style={styles.bold}>Busy only</Text>{" "}
          shares the times and nothing else. <Text style={styles.bold}>Full detail</Text> shares the
          title, place and notes as well. Anything left <Text style={styles.bold}>off</Text> is never
          read and never leaves this phone.
          </>
        }
      />

      {permission !== "granted" ? (
        <View style={styles.card}>
          <Text style={styles.emptyTitle}>Calendar access is off</Text>
          <Text style={styles.emptyText}>
            Your phone has to let the app see your calendars before you can choose between them.
            Nothing is read or uploaded until you set a calendar to share below.
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
              <View key={c.id} style={[styles.calendarBlock, i > 0 ? styles.rowDivider : null]}>
                <View style={styles.row}>
                  <View style={[styles.swatch, { backgroundColor: c.color ?? t.textMuted }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowLabel}>{c.title}</Text>
                    {c.sourceName ? <Text style={styles.rowHint}>{c.sourceName}</Text> : null}
                  </View>
                  {busyId === c.id ? <ActivityIndicator /> : null}
                </View>

                <View style={styles.segmented}>
                  {SHARE_LEVELS.map((level) => {
                    const active = c.shareLevel === level.key;
                    return (
                      <Pressable
                        key={level.key}
                        style={press([styles.segment, active ? styles.segmentActive : null])}
                        onPress={() => choose(c, level.key)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                      >
                        <Text
                          style={[styles.segmentText, active ? styles.segmentTextActive : null]}
                        >
                          {level.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <Text style={styles.rowHint}>
                  {SHARE_LEVELS.find((l) => l.key === c.shareLevel)?.blurb}
                </Text>
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            {sharedCount === 0
              ? "Nothing is shared, so the app can't work out when you're free. Set at least the calendar your commitments live in to Busy only."
              : `${sharedCount} of ${calendars.length} shared${detailedCount > 0 ? `, ${detailedCount} in full detail` : ""}. Turning one down deletes what it shared straight away. The times come back on the next sync if it's still on.`}
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
    card: {
      ...t.card,
      paddingHorizontal: t.space(4)
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
    },
    calendarBlock: { paddingVertical: t.space(4) },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    bold: { fontWeight: "700", color: t.textPrimary },
    segmented: {
      flexDirection: "row",
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.md,
      padding: 3,
      marginTop: t.space(3),
      marginBottom: t.space(2),
    },
    segment: {
      flex: 1,
      paddingVertical: t.space(2),
      borderRadius: t.radius.sm,
      alignItems: "center",
    },
    segmentActive: { backgroundColor: t.surface, ...t.shadow },
    segmentText: { ...t.type.label, color: t.textMuted },
    segmentTextActive: { color: t.brand },
    swatch: { width: 10, height: 10, borderRadius: 5 },
    rowLabel: { ...t.type.heading, color: t.textPrimary },
    rowHint: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
    emptyTitle: {
      fontSize: 15,
      fontWeight: "600",
      color: t.textPrimary,
      marginTop: t.space(4),
    },
    emptyText: {
      ...t.type.caption,
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
    buttonText: { color: t.textOnBrand, ...t.type.heading },
    footnote: {
      ...t.type.caption,
      color: t.textMuted,
      marginTop: t.space(4),
    },
  });
