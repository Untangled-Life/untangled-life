import { useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  RefreshControl,
} from "react-native";
import { press } from "@/components/press";
import { succeeded, warned } from "@/lib/haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { CalendarIcon, MenuIcon } from "@/components/icons";
import { Theme } from "@/theme/tokens";
import { Link, router } from "expo-router";
import * as Calendar from "expo-calendar/legacy";
import { PermissionStatus } from "expo";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, daysUntil, displayTitleFor, countdownLabel } from "@/lib/keyDates";
import { Image } from "expo-image";
import { Avatar } from "@/components/avatar";
import { useCouplePhotos } from "@/hooks/useCouplePhotos";
import { pickPhoto, uploadPhoto, removePhoto } from "@/lib/photos";
import { syncBusyBlocks } from "@/lib/calendarSync";
import { listCalendars } from "@/lib/calendarPrefs";
import { deviceTimeZone } from "@/lib/timezone";
import { repeatLabel } from "@/lib/recurrence";
import { dualTimeText, zoneGapSentence } from "@/components/dual-time";
import { HomeSection, resolveHomeLayout, visibleSections } from "@/lib/homeLayout";
import {
  Interval,
  nextSharedFreeWindows,
  formatWindow,
  FreeTimePrefs,
  DEFAULT_FREE_TIME_PREFS,
} from "@/lib/freeTime";
import { WorkPattern, WorkShift, expandWorkHours, toDateKey, describePattern } from "@/lib/workHours";
import {
  PlannedEvent,
  createPlannedEvent,
  cancelPlannedEvent,
  syncPlannedEventsToDevice,
  loadUpcomingPlans,
  formatPlanWhen,
  UpcomingPlan,
} from "@/lib/plannedEvents";

const DEFAULT_PLAN_HOURS = 2;

export default function Home() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile, signOut } = useAuth();
  const { me, partner } = useCoupleMembers();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [calendarCount, setCalendarCount] = useState<number | null>(null);
  const [connectedCount, setConnectedCount] = useState<number | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const { coverUrl, coverPath, myAvatarUrl, partnerAvatarUrl, reload: reloadPhotos } =
    useCouplePhotos();
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);
  const [freeWindows, setFreeWindows] = useState<Interval[]>([]);

  // "Both calendars look packed" is the wrong thing to say to a couple whose
  // waking hours simply do not meet. Nothing they delete will help, and being
  // told to clear a diary that is already empty is worse than being told
  // nothing.
  const [noZoneOverlap, setNoZoneOverlap] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [myPattern, setMyPattern] = useState<WorkPattern | null>(null);
  const [plans, setPlans] = useState<UpcomingPlan[]>([]);
  const [bookingIndex, setBookingIndex] = useState<number | null>(null);
  const [bookingTitle, setBookingTitle] = useState("");
  const [booking, setBooking] = useState(false);

  const partnerName = partner?.display_name ?? "Partner";
  const myId = me.id;
  const partnerId = partner?.id ?? null;

  // The stored zone is what the partner's phone last reported; ours comes
  // straight off this device, so it is right even before the sync has written
  // it back.
  const myZone = profile?.time_zone ?? deviceTimeZone();
  const partnerZone = partner?.time_zone ?? null;

  // Worked out once per render against now rather than per row: the answer is
  // the same for everything on screen and each call costs a formatter.
  const zoneGap = zoneGapSentence(new Date(), myZone, partnerZone, partner?.display_name ?? "They");
  const zonesApart = zoneGap !== null;

  const nameFor = useCallback(
    (userId: string | null) => {
      if (userId && userId === myId) return me.display_name ?? "You";
      if (userId && userId === partnerId) return partnerName;
      return partnerName;
    },
    [myId, partnerId, me.display_name, partnerName]
  );

  const loadKeyDates = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring, kind, subject_user_id, reminder_days, reminders_on, notes, end_date, pinned")
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

    // all_day is excluded on purpose. An all-day event now syncs (it's worth
    // seeing "Alyssa - annual leave" on the shared calendar) but treating it
    // as 24 hours of busy would wipe out every free window on that day, and
    // being on leave is the opposite of being unavailable.
    // What counts as a free window is a per-couple setting now, not a constant.
    // Read it alongside the busy blocks rather than in its own effect, so the
    // windows are never computed once with the defaults and again with the
    // real values -- which shows as the list visibly changing under you.
    const prefsRes = await supabase
      .from("couples")
      .select("day_start_hour, day_end_hour, min_free_minutes")
      .eq("id", profile?.couple_id ?? "")
      .maybeSingle();

    const prefs: FreeTimePrefs = prefsRes.data
      ? {
          dayStartHour:
            (prefsRes.data.day_start_hour as number) ?? DEFAULT_FREE_TIME_PREFS.dayStartHour,
          dayEndHour: (prefsRes.data.day_end_hour as number) ?? DEFAULT_FREE_TIME_PREFS.dayEndHour,
          minFreeMinutes:
            (prefsRes.data.min_free_minutes as number) ?? DEFAULT_FREE_TIME_PREFS.minFreeMinutes,
        }
      : DEFAULT_FREE_TIME_PREFS;

    const { data } = await supabase
      .from("busy_blocks")
      .select("user_id, start_at, end_at")
      .eq("all_day", false)
      .lte("start_at", windowEnd.toISOString())
      .gte("end_at", new Date().toISOString());

    if (!data) return;

    const toInterval = (b: { start_at: string; end_at: string }): Interval => ({
      start: new Date(b.start_at),
      end: new Date(b.end_at),
    });

    const mine = data.filter((b) => b.user_id === session.user.id).map(toInterval);
    const theirs = data.filter((b) => b.user_id !== session.user.id).map(toInterval);

    // Working hours count as busy too -- without them, "free together" happily
    // suggests the middle of a shift.
    const now = new Date();
    const [patternRes, shiftRes] = await Promise.all([
      supabase.from("work_patterns").select("id, user_id, mode, cycle_weeks, anchor_date, shifts, time_zone"),
      supabase
        .from("work_shifts")
        .select("id, user_id, date, start_time, end_time, kind, time_zone")
        .gte("date", toDateKey(now))
        .lte("date", toDateKey(windowEnd)),
    ]);

    const patterns = (patternRes.data as WorkPattern[]) ?? [];
    const workShifts = (shiftRes.data as WorkShift[]) ?? [];
    const userIds = new Set<string>([
      ...patterns.map((p) => p.user_id),
      ...workShifts.map((w) => w.user_id),
    ]);

    const myWork: Interval[] = [];
    const theirWork: Interval[] = [];

    for (const uid of userIds) {
      const intervals = expandWorkHours(
        patterns.find((p) => p.user_id === uid) ?? null,
        workShifts.filter((w) => w.user_id === uid),
        now,
        windowEnd
      );
      if (uid === session.user.id) myWork.push(...intervals);
      else theirWork.push(...intervals);
    }

    setMyPattern(patterns.find((p) => p.user_id === session.user.id) ?? null);

    const zones = { mine: myZone, theirs: partnerZone };
    const windows = nextSharedFreeWindows(
      [...mine, ...myWork],
      [...theirs, ...theirWork],
      prefs,
      zones
    );

    setFreeWindows(windows);
    // Only asked when the answer was empty: run the same calculation with
    // nothing in either diary AND no minimum length. Still empty means the
    // waking hours themselves never meet, which is a different problem with a
    // different fix. Keeping the minimum in the probe would blame the zones for
    // an overlap that exists but is shorter than the couple asked to hear
    // about, and send them to the wrong setting.
    setNoZoneOverlap(
      windows.length === 0 &&
        nextSharedFreeWindows([], [], { ...prefs, minFreeMinutes: 0 }, zones).length === 0
    );
  }, [session?.user.id, profile?.couple_id, myZone, partnerZone]);

  const syncAndLoad = useCallback(async () => {
    if (!profile?.couple_id || !session?.user.id) return;
    setSyncing(true);
    // Pick up anything the partner booked before reading the calendar back,
    // so their plans count as busy time here too.
    const syncResult = await syncPlannedEventsToDevice(session.user.id);
    await syncBusyBlocks(profile.couple_id, session.user.id);
    await Promise.all([loadFreeWindows(), loadPlans()]);
    setSyncing(false);
    return syncResult;
  }, [profile?.couple_id, session?.user.id, loadFreeWindows, loadPlans]);

  /**
   * Everything this screen shows can change elsewhere -- your partner books a
   * date, you add a key date on another tab, a calendar event moves. So it
   * reloads whenever it comes back into view rather than only on mount, and
   * re-reads the phone's calendar when permission allows.
   */
  const refreshAll = useCallback(async () => {
    const permissionResult = await Calendar.getCalendarPermissionsAsync();
    setPermission(permissionResult.status);

    if (permissionResult.status === PermissionStatus.GRANTED && session?.user.id) {
      const all = await listCalendars(session.user.id);
      setCalendarCount(all.length);
      setConnectedCount(all.filter((c) => c.shareLevel !== "off").length);
    }

    await Promise.all([loadKeyDates(), loadPlans()]);

    if (permissionResult.status === PermissionStatus.GRANTED) {
      await syncAndLoad();
    } else {
      await loadFreeWindows();
    }
  }, [loadKeyDates, loadPlans, loadFreeWindows, syncAndLoad, session?.user.id]);

  const { refreshing, onRefresh } = useRefreshOnFocus(refreshAll);

  async function requestAccess() {
    const result = await Calendar.requestCalendarPermissionsAsync();
    setPermission(result.status);
    if (result.status === PermissionStatus.GRANTED) {
      // Permission on its own shares nothing now -- every calendar starts
      // disconnected -- so go straight to the choice rather than leaving them
      // on a screen that looks connected and shows no free time.
      router.push("/calendars");
    }
  }

  function startBooking(index: number) {
    setBookingIndex(index);
    setBookingTitle("");
  }

  async function confirmBooking(window: Interval) {
    if (!profile?.couple_id || !session?.user.id) return;

    const title = bookingTitle.trim() || "Date night";
    // Belt and braces: the window list is already trimmed to the future, but a
    // screen left open for a while can still hand us a start that has passed,
    // and an event in the past never reaches the calendar.
    const now = new Date();
    const start = window.start < now ? now : window.start;
    const cappedEnd = new Date(start.getTime() + DEFAULT_PLAN_HOURS * 60 * 60 * 1000);
    const end = cappedEnd < window.end ? cappedEnd : window.end;

    setBooking(true);
    const { error } = await createPlannedEvent({
      coupleId: profile.couple_id,
      userId: session.user.id,
      title,
      startAt: start,
      endAt: end,
      // "Book it on both phones" says what it does on the button, so it owns
      // nothing in particular and goes to both. push_to defaults to empty now
      // that it's a real choice in the event editor, so this has to be
      // explicit or the feature silently stops reaching either calendar.
      ownerUserId: null,
      pushTo: partnerId ? [session.user.id, partnerId] : [session.user.id],
    });

    if (error) {
      setBooking(false);
      Alert.alert("Couldn't book that", error.message);
      return;
    }

    succeeded();
    setBookingIndex(null);
    setBookingTitle("");

    try {
      const syncResult = await syncAndLoad();

      // We just created a plan, so exactly one event should have been added to
      // this phone. Anything else means it didn't land, and the user needs to
      // hear that rather than trust a calendar entry that isn't there.
      if (syncResult?.problem) {
        Alert.alert("Saved, but not on your calendar", syncResult.problem);
      } else if (!syncResult) {
        Alert.alert(
          "Saved, but not on your calendar",
          "The calendar sync didn't run. Try reopening the app."
        );
      } else if (syncResult.added === 0) {
        Alert.alert(
          "Saved, but not on your calendar",
          "The date was saved but nothing was added to this phone's calendar. It may not have synced back yet, so reopen the app to retry."
        );
      }
    } catch (e) {
      Alert.alert(
        "Saved, but not on your calendar",
        e instanceof Error ? e.message : "Couldn't reach this phone's calendar."
      );
    } finally {
      setBooking(false);
    }
  }

  function confirmCancel(plan: PlannedEvent) {
    // Cancelling flags the row, and a repeating event is a single row. Until
    // there is a way to skip one occurrence, saying "this plan" about a weekly
    // dinner is a promise the app does not keep.
    const repeats = (plan.repeat_every ?? "none") !== "none";
    const message = repeats
      ? `"${plan.title}" repeats. Every occurrence will come off both your calendars, not just this one.`
      : `"${plan.title}" will come off both your calendars.`;

    Alert.alert(repeats ? "Cancel every one?" : "Cancel this plan?", message, [
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

  async function changeCover() {
    if (!profile?.couple_id || uploadingCover) return;

    const { photo, error } = await pickPhoto("cover");
    if (error) {
      warned();
      Alert.alert("Couldn't use that photo", error);
      return;
    }
    if (!photo) return;

    setUploadingCover(true);
    const previous = coverPath;

    const upload = await uploadPhoto("cover", profile.couple_id, photo);
    if (upload.error || !upload.path) {
      setUploadingCover(false);
      warned();
      Alert.alert("Couldn't save that photo", upload.error ?? "Please try again.");
      return;
    }

    const { error: saveError } = await supabase
      .from("couples")
      .update({ cover_path: upload.path })
      .eq("id", profile.couple_id);

    if (saveError) {
      // The file uploaded but nothing points at it, so take it back out rather
      // than leaving an orphan in the bucket.
      await removePhoto(upload.path);
      setUploadingCover(false);
      warned();
      Alert.alert("Couldn't save that photo", saveError.message);
      return;
    }

    await removePhoto(previous);
    await reloadPhotos();
    setUploadingCover(false);
    succeeded();
  }

  const setupSteps = [
    permission !== PermissionStatus.GRANTED
      ? {
          label: "Connect your calendar",
          why: "So we can find time you're both actually free",
          onPress: requestAccess,
        }
      : connectedCount === 0
        ? {
            label: "Choose what you share",
            why: "Nothing is shared until you set at least one calendar",
            onPress: () => router.push("/calendars"),
          }
        : null,
    !myPattern || myPattern.shifts.length === 0
      ? {
          label: "Add your working hours",
          why: "So free time stops suggesting the middle of a shift",
          onPress: () => router.push("/work-hours"),
        }
      : null,
    keyDates.length === 0
      ? {
          label: "Add your key dates",
          why: "Anniversary and birthdays, with reminders in good time",
          onPress: () => router.push("/key-dates"),
        }
      : null,
  ].filter((step): step is { label: string; why: string; onPress: () => void } => step !== null);

  const upcoming = [...keyDates].sort(
    (a, b) => daysUntil(a.date, a.recurring) - daysUntil(b.date, b.recurring)
  );

  // A one-off date that has been and gone stops being news. It stays on the
  // calendar and in Key Dates -- it happened -- but a countdown reading "-30
  // days" is just clutter. Recurring dates never expire; daysUntil rolls them
  // to next year. A trip counts as live until its LAST day, so a week in Bali
  // keeps its countdown for the whole week rather than vanishing on arrival.
  const live = upcoming.filter(
    (kd) => kd.recurring || daysUntil(kd.end_date ?? kd.date, false) >= 0
  );

  // Pinned dates get the big treatment at the top.
  const pinned = live.filter((kd) => kd.pinned);
  const pinnedIds = new Set(pinned.map((kd) => kd.id));
  const carousel = live.filter((kd) => !pinnedIds.has(kd.id));

  // Their own arrangement of this screen. Null means never set, which is the
  // default order with everything showing -- so an existing user sees no
  // change until they go and move something.
  const visible = visibleSections(resolveHomeLayout(profile?.home_sections));

  // Each Home section, keyed so the arrangement can decide what appears
  // and in what order. Wrapped in a keyed <View> because the list is
  // rendered from an array -- without the key React reorders by position
  // and carries state across into whatever section took that slot.
  const sectionBlocks: Record<HomeSection, React.ReactNode> = {
    pinned: (
      <View key="pinned">
        {pinned.map((kd) => (
          <Link key={kd.id} href="/key-dates" asChild>
            <Pressable style={press(styles.hero)}>
              <Text style={styles.heroCountdown}>{countdownLabel(kd)}</Text>
              <Text style={styles.heroTitle}>{displayTitleFor(kd, nameFor)}</Text>
              {kd.notes ? (
                <Text style={styles.heroNote} numberOfLines={2}>
                  {kd.notes}
                </Text>
              ) : null}
            </Pressable>
          </Link>
        ))}
      </View>
    ),
    keyDates: (
      <View key="keyDates">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Key dates &amp; countdowns</Text>
          <Link href="/key-dates" style={styles.sectionAction}>
            Manage
          </Link>
        </View>

        {carousel.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {pinned.length > 0
                ? "Nothing else coming up. The one that matters is pinned above."
                : `No key dates yet. Add ${partnerName}'s birthday or your anniversary to start a countdown.`}
            </Text>
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 24 }}>
            {carousel.map((kd) => {
              const days = daysUntil(kd.date, kd.recurring);
              return (
                <View key={kd.id} style={styles.keyDateCard}>
                  <Text style={styles.keyDateDays}>
                    {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                  </Text>
                  <Text style={styles.keyDateTitle} numberOfLines={2}>
                    {displayTitleFor(kd, nameFor)}
                  </Text>
                  {/* The gift idea belongs where you'll see it -- on the
                      countdown, not two taps away on a screen you only open when
                      you're already thinking about it. */}
                  {kd.notes ? (
                    <Text style={styles.keyDateNote} numberOfLines={2}>
                      {kd.notes}
                    </Text>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
        )}
      </View>
    ),
    bookedIn: (
      <View key="bookedIn">
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
                      {formatPlanWhen(
                        plan.occurrenceStart.toISOString(),
                        plan.occurrenceEnd.toISOString()
                      )}
                      {plan.repeat_every && plan.repeat_every !== "none"
                        ? ` · ${repeatLabel(plan.repeat_every).toLowerCase()}`
                        : ""}
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
      </View>
    ),
    freeTogether: (
      <View key="freeTogether">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Free together</Text>
          <View style={styles.sectionActions}>
            <Link href="/work-hours" style={styles.sectionAction}>
              Your hours
            </Link>
            <Link href="/free-time" style={styles.sectionAction}>
              Settings
            </Link>
          </View>
        </View>

        {zoneGap ? <Text style={styles.zoneGap}>{zoneGap}</Text> : null}

        {permission !== PermissionStatus.GRANTED ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Connect your calendar below to see this.</Text>
          </View>
        ) : connectedCount === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              No calendars shared yet, so there&apos;s nothing to work from. Choose what to share
              below.
            </Text>
          </View>
        ) : syncing && freeWindows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>Checking both your calendars...</Text>
          </View>
        ) : freeWindows.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {noZoneOverlap
                ? `Your hours and ${partnerName}'s don't meet at all while you're this far apart. Widening the day in Free together is what would change that, not clearing the calendar.`
                : "No shared free time found in the next week. Both calendars look packed."}
            </Text>
          </View>
        ) : (
          <View style={{ marginBottom: 8 }}>
            {freeWindows.map((w, i) => (
              <View key={i} style={styles.freeRow}>
                <View style={styles.freeRowTop}>
                  <Text style={styles.freeText}>{formatWindow(w)}</Text>
                  {zonesApart ? (
                    <Text style={styles.freeTheirTime}>
                      {dualTimeText(w.start, myZone, partnerZone, partnerName)}
                    </Text>
                  ) : null}
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
                      placeholderTextColor={t.textMuted}
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
                        style={press([styles.smallButton, booking ? styles.smallButtonDisabled : null])}
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
      </View>
    ),
    workHours: (
      <View key="workHours">
        <Link href="/work-hours" asChild>
          <Pressable style={press(styles.hoursCard)}>
            <View style={styles.cardHeadRow}>
              <Text style={styles.hoursTitle}>Your working hours</Text>
              <Text style={styles.cardAction}>
                {myPattern && myPattern.shifts.length > 0 ? "Change ›" : "Set up ›"}
              </Text>
            </View>
            <Text style={styles.cardBody}>{describePattern(myPattern)}</Text>
          </Pressable>
        </Link>
      </View>
    ),
    calendars: (
      <View key="calendars">
        {permission === PermissionStatus.GRANTED ? (
          <Link href="/calendars" asChild>
            <Pressable style={press(styles.card)}>
              <Text style={styles.cardTitle}>Calendars</Text>
              <Text style={styles.cardBody}>
                {/* connectedCount is null until the calendar enumeration
                    lands, and null === 0 is false -- which used to render the
                    literal "null of null shared" on every cold start. */}
                {connectedCount === null
                  ? "Checking which calendars you're sharing…"
                  : connectedCount === 0
                    ? `None of the ${calendarCount ?? 0} calendars on this phone are shared, so nothing from them reaches your partner.`
                    : `${connectedCount} of ${calendarCount ?? connectedCount} shared. Tap to change what each one gives away: busy times only, or the full detail.`}
              </Text>
            </Pressable>
          </Link>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Calendar access</Text>
            <Text style={styles.cardBody}>
              Not connected yet. We read the calendars already synced to your phone, so this covers
              Google and Apple/iCloud without a separate sign-in for each, and you choose, calendar
              by calendar, whether your partner sees just your busy times or the full detail.
            </Text>
            <Pressable style={press(styles.button)} onPress={requestAccess}>
              <Text style={styles.buttonText}>Connect my calendar</Text>
            </Pressable>
          </View>
        )}
      </View>
    ),
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      }
    >
      <View style={styles.topBar}>
        <Link href="/menu" asChild>
          <Pressable style={press(styles.iconButton)} hitSlop={8} accessibilityLabel="Menu">
            <MenuIcon size={22} color={t.textPrimary} />
          </Pressable>
        </Link>
        <Link href="/calendar" asChild>
          <Pressable style={press(styles.iconButton)} hitSlop={8} accessibilityLabel="Shared calendar">
            <CalendarIcon size={22} color={t.brand} />
          </Pressable>
        </Link>
      </View>

      <Pressable
        style={press(styles.cover)}
        onPress={changeCover}
        accessibilityLabel={coverUrl ? "Change cover photo" : "Add a cover photo"}
      >
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.coverImage} contentFit="cover" transition={200} />
        ) : (
          <View style={styles.coverEmpty}>
            <Text style={styles.coverEmptyText}>
              {uploadingCover ? "Adding your photo…" : "Add a photo of the two of you"}
            </Text>
          </View>
        )}

        <View style={styles.coverFaces}>
          <Avatar url={myAvatarUrl} name={me.display_name} size={44} />
          <View style={styles.coverFaceOverlap}>
            <Avatar url={partnerAvatarUrl} name={partner?.display_name ?? null} size={44} />
          </View>
        </View>
      </Pressable>

      <Text style={styles.title}>
        {partner?.display_name ? `${me.display_name ?? "You"} & ${partner.display_name}` : "You're in"}
      </Text>
      <Text style={styles.subtitle}>Here&apos;s what&apos;s coming up together.</Text>

      {/* A brand-new couple lands here with nothing and no idea what to do
          first. This says so, in order, and disappears as each is done --
          rather than leaving three empty sections to interpret. */}
      {setupSteps.length > 0 ? (
        <View style={styles.setupCard}>
          <Text style={styles.setupTitle}>Finish setting up</Text>
          <Text style={styles.setupBody}>
            {setupSteps.length === 1
              ? "One thing left before this really works."
              : `${setupSteps.length} quick things and this starts earning its keep.`}
          </Text>
          {setupSteps.map((step) => (
            <Pressable key={step.label} style={press(styles.setupStep)} onPress={step.onPress}>
              <View style={styles.setupDot} />
              <View style={{ flex: 1 }}>
                <Text style={styles.setupStepLabel}>{step.label}</Text>
                <Text style={styles.setupStepWhy}>{step.why}</Text>
              </View>
              <Text style={styles.setupChevron}>›</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {visible.map((key) => sectionBlocks[key])}

      <Pressable onPress={() => signOut()} style={press({ marginTop: 32 })}>
        <Text style={styles.link}>Signed in as {profile?.display_name ?? "you"}. Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: t.space(6), paddingTop: t.space(14), paddingBottom: 40 },
  cover: {
    height: 170,
    borderRadius: t.radius.lg,
    overflow: "hidden",
    backgroundColor: t.surface,
    marginBottom: t.space(5),
    justifyContent: "flex-end",
  },
  coverImage: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  coverEmpty: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  coverEmptyText: { fontSize: 13, color: t.textMuted },
  coverFaces: { flexDirection: "row", padding: t.space(3) },
  // Overlapped rather than side by side: two circles touching reads as a
  // couple, two circles apart reads as a list of users.
  coverFaceOverlap: { marginLeft: -14 },
  setupCard: {
    backgroundColor: t.accentSoft,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(6),
  },
  setupTitle: { fontSize: 16, fontWeight: "700", color: t.accent, marginBottom: t.space(1) },
  setupBody: { fontSize: 13, color: t.textSecondary, marginBottom: t.space(4), lineHeight: 18 },
  setupStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space(3),
    paddingVertical: t.space(3),
  },
  setupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: t.accent,
  },
  setupStepLabel: { fontSize: 14, fontWeight: "600", color: t.textPrimary },
  setupStepWhy: { fontSize: 12, color: t.textSecondary, marginTop: 1 },
  setupChevron: { fontSize: 20, color: t.accent },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: t.space(5),
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: t.radius.pill,
    backgroundColor: t.surface,
    alignItems: "center",
    justifyContent: "center",
    ...t.shadow,
  },
  hoursCard: {
    backgroundColor: t.surface,
    borderRadius: t.radius.lg,
    padding: 20,
    marginTop: 16,
    borderLeftWidth: 3,
    borderLeftColor: t.dotWork,
    ...t.shadow,
  },
  hoursTitle: { fontSize: 16, fontWeight: "600", color: t.textPrimary },
  cardHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardAction: { fontSize: 13, color: t.accent, fontWeight: "600" },
  title: { fontSize: 26, fontWeight: "600", marginBottom: 8, color: t.textPrimary },
  subtitle: { fontSize: 14, color: t.textSecondary, lineHeight: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: t.textPrimary },
  sectionAction: { fontSize: 14, color: t.accent, fontWeight: "600" },
  sectionActions: { flexDirection: "row", gap: t.space(4) },
  emptyCard: { backgroundColor: t.surface, borderRadius: t.radius.lg, padding: 20, marginBottom: 24 },
  emptyText: { fontSize: 13, color: t.textSecondary, lineHeight: 18 },
  keyDateCard: {
    backgroundColor: t.surface,
    borderRadius: t.radius.lg,
    padding: 16,
    marginRight: 12,
    width: 140,
  },
  keyDateDays: { fontSize: 20, fontWeight: "700", color: t.brand, marginBottom: 6 },
  keyDateTitle: { fontSize: 13, color: t.textPrimary },
  keyDateNote: { fontSize: 11, color: t.textMuted, marginTop: 4, lineHeight: 15 },
  hero: {
    backgroundColor: t.accentSoft,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(4),
  },
  heroCountdown: { fontSize: 30, fontWeight: "800", color: t.accent, letterSpacing: -0.5 },
  heroTitle: { fontSize: 15, fontWeight: "600", color: t.textPrimary, marginTop: 2 },
  heroNote: { fontSize: 12, color: t.textSecondary, marginTop: t.space(2), lineHeight: 17 },
  planRow: {
    backgroundColor: t.surface,
    borderRadius: t.radius.md,
    padding: 14,
    marginBottom: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  planTitle: { fontSize: 14, fontWeight: "600", color: t.textPrimary, marginBottom: 2 },
  planWhen: { fontSize: 12, color: t.textSecondary },
  planCancel: { fontSize: 13, color: t.textMuted, marginLeft: 12 },
  freeRow: { backgroundColor: t.surface, borderRadius: t.radius.md, padding: 14, marginBottom: 8 },
  freeRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freeTheirTime: { fontSize: 12, color: t.textMuted, marginTop: 2 },
  zoneGap: {
    fontSize: 12,
    color: t.textSecondary,
    backgroundColor: t.accentSoft,
    borderRadius: t.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
    lineHeight: 17,
  },
  freeText: { fontSize: 14, color: t.textPrimary, fontWeight: "500", flex: 1 },
  bookLink: { fontSize: 13, color: t.accent, fontWeight: "600", marginLeft: 12 },
  bookingBox: { marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: t.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: t.textPrimary,
  },
  bookingHint: { fontSize: 12, color: t.textMuted, marginTop: 8 },
  bookingActions: { flexDirection: "row", alignItems: "center", marginTop: 12 },
  smallButton: {
    backgroundColor: t.accent,
    borderRadius: t.radius.pill,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  smallButtonDisabled: { opacity: 0.6 },
  smallButtonText: { color: t.surface, fontWeight: "600", fontSize: 13 },
  bookingCancel: { fontSize: 13, color: t.textMuted, marginLeft: 16 },
  card: { backgroundColor: t.surface, borderRadius: t.radius.lg, padding: 20, marginTop: 16 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: t.textPrimary },
  cardBody: { fontSize: 14, color: t.textSecondary, lineHeight: 20, marginBottom: 16 },
  button: { backgroundColor: t.accent, borderRadius: t.radius.pill, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: t.surface, fontWeight: "600", fontSize: 14 },
  link: { textAlign: "center", color: t.textMuted, fontSize: 13 },
  });
