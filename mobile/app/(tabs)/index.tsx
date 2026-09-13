import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { Link } from "expo-router";
import * as Calendar from "expo-calendar";
import { PermissionStatus } from "expo";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, daysUntil, displayTitleFor } from "@/lib/keyDates";
import { syncBusyBlocks } from "@/lib/calendarSync";
import { Interval, nextSharedFreeWindows, formatWindow } from "@/lib/freeTime";
import {
  PlannedEvent,
  createPlannedEvent,
  cancelPlannedEvent,
  syncPlannedEventsToDevice,
  loadUpcomingPlans,
  formatPlanWhen,
} from "@/lib/plannedEvents";

const DEFAULT_PLAN_HOURS = 2;

export default function Home() {
  const { session, profile, signOut } = useAuth();
  const { partner } = useCoupleMembers();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [calendarCount, setCalendarCount] = useState<number | null>(null);
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [freeWindows, setFreeWindows] = useState<Interval[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [plans, setPlans] = useState<PlannedEvent[]>([]);
  const [bookingIndex, setBookingIndex] = useState<number | null>(null);
  const [bookingTitle, setBookingTitle] = useState("");
  const [booking, setBooking] = useState(false);

  const partnerName = partner?.display_name ?? "Partner";

  const loadKeyDates = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring, kind")
      .order("date", { ascending: true });
    if (data) setKeyDates(data as KeyDateRow[]);
  }, []);

  const loadPlans = useCallback(async () => {
    setPlans(await loadUpcomingPlans());
  }, []);

  const loadFreeWindows = useCallback(async () => {
    if (!session?.user.id) return;
    const windowEnd = new Date();
    windowEnd.setDate(windowEnd.getDate() + 8);

    const { data } = await supabase
      .from("busy_blocks")
      .select("user_id, start_at, end_at")
      .lte("start_at", windowEnd.toISOString())
      .gte("end_at", new Date().toISOString());

    if (!data) return;

    const toInterval = (b: { start_at: string; end_at: string }): Interval => ({
      start: new Date(b.start_at),
      end: new Date(b.end_at),
    });

    const mine = data.filter((b) => b.user_id === session.user.id).map(toInterval);
    const theirs = data.filter((b) => b.user_id !== session.user.id).map(toInterval);
    setFreeWindows(nextSharedFreeWindows(mine, theirs));
  }, [session?.user.id]);

  const syncAndLoad = useCallback(async () => {
    if (!profile?.couple_id || !session?.user.id) return;
    setSyncing(true);
    // Pick up anything the partner booked before reading the calendar back,
    // so their plans count as busy time here too.
    await syncPlannedEventsToDevice(session.user.id);
    await syncBusyBlocks(profile.couple_id, session.user.id);
    await Promise.all([loadFreeWindows(), loadPlans()]);
    setSyncing(false);
  }, [profile?.couple_id, session?.user.id, loadFreeWindows, loadPlans]);

  useEffect(() => {
    Calendar.getCalendarPermissionsAsync().then((result) => {
      setPermission(result.status);
      if (result.status === PermissionStatus.GRANTED) {
        syncAndLoad();
      }
    });
    loadKeyDates();
    loadFreeWindows();
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKeyDates]);

  async function requestAccess() {
    const result = await Calendar.requestCalendarPermissionsAsync();
    setPermission(result.status);
    if (result.status === PermissionStatus.GRANTED) {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      setCalendarCount(calendars.length);
      syncAndLoad();
    }
  }

  function startBooking(index: number) {
    setBookingIndex(index);
    setBookingTitle("");
  }

  async function confirmBooking(window: Interval) {
    if (!profile?.couple_id || !session?.user.id) return;

    const title = bookingTitle.trim() || "Date night";
    const start = window.start;
    const cappedEnd = new Date(start.getTime() + DEFAULT_PLAN_HOURS * 60 * 60 * 1000);
    const end = cappedEnd < window.end ? cappedEnd : window.end;

    setBooking(true);
    const { error } = await createPlannedEvent({
      coupleId: profile.couple_id,
      userId: session.user.id,
      title,
      startAt: start,
      endAt: end,
    });

    if (error) {
      setBooking(false);
      Alert.alert("Couldn't book that", error.message);
      return;
    }

    setBookingIndex(null);
    setBookingTitle("");
    await syncAndLoad();
    setBooking(false);
  }

  function confirmCancel(plan: PlannedEvent) {
    Alert.alert("Cancel this plan?", `"${plan.title}" will come off both your calendars.`, [
      { text: "Keep it", style: "cancel" },
      {
        text: "Cancel plan",
        style: "destructive",
        onPress: async () => {
          await cancelPlannedEvent(plan.id);
          await syncAndLoad();
        },
      },
    ]);
  }

  const upcoming = [...keyDates].sort(
    (a, b) => daysUntil(a.date, a.recurring) - daysUntil(b.date, b.recurring)
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>You&apos;re in</Text>
      <Text style={styles.subtitle}>
        You&apos;re paired up. Here&apos;s what&apos;s coming up together.
      </Text>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Key dates &amp; countdowns</Text>
        <Link href="/key-dates" style={styles.sectionAction}>
          Manage
        </Link>
      </View>

      {upcoming.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No key dates yet — add {partnerName}&apos;s birthday or your anniversary to start a
            countdown.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
          {upcoming.map((kd) => {
            const days = daysUntil(kd.date, kd.recurring);
            return (
              <View key={kd.id} style={styles.keyDateCard}>
                <Text style={styles.keyDateDays}>
                  {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                </Text>
                <Text style={styles.keyDateTitle} numberOfLines={2}>
                  {displayTitleFor(kd, partnerName)}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      {plans.length > 0 ? (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Booked in</Text>
          </View>
          <View style={{ marginBottom: 24 }}>
            {plans.map((plan) => (
              <View key={plan.id} style={styles.planRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.planTitle}>{plan.title}</Text>
                  <Text style={styles.planWhen}>
                    {formatPlanWhen(plan.start_at, plan.end_at)}
                    {plan.created_by === session?.user.id ? "" : ` · ${partnerName} booked this`}
                  </Text>
                </View>
                <Pressable onPress={() => confirmCancel(plan)} hitSlop={8}>
                  <Text style={styles.planCancel}>Cancel</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : null}

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Free together</Text>
      </View>

      {permission !== PermissionStatus.GRANTED ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Connect your calendar below to see this.</Text>
        </View>
      ) : syncing && freeWindows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Checking both your calendars...</Text>
        </View>
      ) : freeWindows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No shared free time found in the next week — both calendars look packed.
          </Text>
        </View>
      ) : (
        <View style={{ marginBottom: 8 }}>
          {freeWindows.map((w, i) => (
            <View key={i} style={styles.freeRow}>
              <View style={styles.freeRowTop}>
                <Text style={styles.freeText}>{formatWindow(w)}</Text>
                {bookingIndex === i ? null : (
                  <Pressable onPress={() => startBooking(i)} hitSlop={8}>
                    <Text style={styles.bookLink}>Book it</Text>
                  </Pressable>
                )}
              </View>

              {bookingIndex === i ? (
                <View style={styles.bookingBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="Date night"
                    placeholderTextColor="#9A9A9A"
                    value={bookingTitle}
                    onChangeText={setBookingTitle}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => confirmBooking(w)}
                  />
                  <Text style={styles.bookingHint}>
                    Goes in both your calendars, starting {formatWindow(w).split(", ").slice(1).join(", ")}.
                  </Text>
                  <View style={styles.bookingActions}>
                    <Pressable
                      style={[styles.smallButton, booking ? styles.smallButtonDisabled : null]}
                      onPress={() => confirmBooking(w)}
                      disabled={booking}
                    >
                      <Text style={styles.smallButtonText}>
                        {booking ? "Booking..." : "Book it on both phones"}
                      </Text>
                    </Pressable>
                    <Pressable onPress={() => setBookingIndex(null)} hitSlop={8}>
                      <Text style={styles.bookingCancel}>Cancel</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Calendar access</Text>
        <Text style={styles.cardBody}>
          {permission === PermissionStatus.GRANTED
            ? `Connected — reading ${calendarCount ?? "your"} calendar(s) on this phone (Google, iCloud, Outlook — whatever you've got synced).`
            : "Not connected yet. We read the calendars already synced to your phone, so this covers Google and Apple/iCloud without a separate sign-in for each."}
        </Text>
        {permission !== PermissionStatus.GRANTED ? (
          <Pressable style={styles.button} onPress={requestAccess}>
            <Text style={styles.buttonText}>Connect my calendar</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={() => signOut()} style={{ marginTop: 32 }}>
        <Text style={styles.link}>Signed in as {profile?.display_name ?? "you"}. Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "600", marginBottom: 8, color: "#14140F" },
  subtitle: { fontSize: 14, color: "#6B6B6B", lineHeight: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#14140F" },
  sectionAction: { fontSize: 14, color: "#1D9E75", fontWeight: "600" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 24 },
  emptyText: { fontSize: 13, color: "#6B6B6B", lineHeight: 18 },
  keyDateCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 140,
  },
  keyDateDays: { fontSize: 20, fontWeight: "700", color: "#D85A30", marginBottom: 6 },
  keyDateTitle: { fontSize: 13, color: "#14140F" },
  planRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  planTitle: { fontSize: 14, fontWeight: "600", color: "#14140F", marginBottom: 2 },
  planWhen: { fontSize: 12, color: "#6B6B6B" },
  planCancel: { fontSize: 13, color: "#9A9A9A", marginLeft: 12 },
  freeRow: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  freeRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freeText: { fontSize: 14, color: "#14140F", fontWeight: "500", flex: 1 },
  bookLink: { fontSize: 13, color: "#1D9E75", fontWeight: "600", marginLeft: 12 },
  bookingBox: { marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#E5E2DA",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#14140F",
  },
  bookingHint: { fontSize: 12, color: "#9A9A9A", marginTop: 8 },
  bookingActions: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  smallButton: {
    backgroundColor: "#1D9E75",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  smallButtonDisabled: { opacity: 0.6 },
  smallButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  bookingCancel: { fontSize: 13, color: "#9A9A9A", marginLeft: 16 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginTop: 16 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: "#14140F" },
  cardBody: { fontSize: 14, color: "#6B6B6B", lineHeight: 20, marginBottom: 16 },
  button: { backgroundColor: "#1D9E75", borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  link: { textAlign: "center", color: "#9A9A9A", fontSize: 13 },
});
