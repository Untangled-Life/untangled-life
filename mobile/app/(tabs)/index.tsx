import { useCallback, useState } from "react";
import {
  Animated,
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
import { succeeded, warned, tapped } from "@/lib/haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { BellIcon, CalendarIcon, MenuIcon } from "@/components/icons";
import { Theme, FONT_DISPLAY_STRONG } from "@/theme/tokens";
import { Link, router, useFocusEffect } from "expo-router";
import * as Calendar from "expo-calendar/legacy";
import { PermissionStatus } from "expo";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, daysUntil, displayTitleFor, countdownLabel } from "@/lib/keyDates";
import { HomeHero, heroHeight } from "@/components/home-hero";
import { StatusBar } from "expo-status-bar";
import type { NativeScrollEvent, NativeSyntheticEvent } from "react-native";
import { useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { TopScrim } from "@/components/top-scrim";
import { shouldNudge } from "@/lib/dateNudge";
import { loadFreeWindows as loadFreeWindowsData } from "@/lib/freeWindows";
import { useOnboarding } from "@/hooks/useOnboarding";
import { buildInbox } from "@/lib/inbox";
import { ValuedAnswers, fallbackLine, partnerPrompt } from "@/lib/valued";
import { daySeed } from "@/lib/dateIdeas";
import { loadOpenProposals, splitProposals, DateProposal } from "@/lib/dateProposals";
import { AwaitingReview } from "@/lib/dateHistory";
import { nextAwaitingReview } from "@/lib/dateReviews";
import { InboxBadge } from "@/app/(tabs)/inbox";
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
  formatWindow,
} from "@/lib/freeTime";
import { WorkPattern } from "@/lib/workHours";
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
  const { outstanding, load: loadOnboarding } = useOnboarding();
  const { me, partner } = useCoupleMembers();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
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

  // When the couple last put ANYTHING in the diary, which is a different
  // question from what is coming up. See lib/dateNudge.ts.
  const [lastPlannedAt, setLastPlannedAt] = useState<Date | null>(null);
  const [proposals, setProposals] = useState<DateProposal[]>([]);
  const [partnerValued, setPartnerValued] = useState<ValuedAnswers | null>(null);
  const [awaitingReview, setAwaitingReview] = useState<AwaitingReview | null>(null);

  // Drives the top scrim. Home is the one screen where the fade cannot simply
  // be there: the cover photo runs to the top edge on purpose, so the wash has
  // to arrive as the photo leaves rather than sit over it from the start.
  // useState with a lazy initialiser rather than a ref: the value is read
  // during render, by the two scrims that interpolate off it, and reading a
  // ref during render is the thing refs are not for. One Animated.Value
  // either way -- the initialiser runs once.
  const [scrollY] = useState(() => new Animated.Value(0));

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Whether Home is the screen in front of you. useFocusEffect rather than
  // a navigation hook, because expo-router exports this one and the app is
  // not a direct dependant of react-navigation.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );

  // The scroll position at which the bottom of the cover photo clears the
  // status-bar strip. Until then the photo is what is behind the clock, so
  // the dark scrim holds and the icons stay white; after it there is page
  // back there, so the cream one holds and the icons go dark. Fading the
  // cream one in at a fixed 90px put it over the middle of the photograph,
  // which is the grey fog all of this exists to avoid.
  const handover = Math.max(heroHeight(width) - (insets.top + 32), 80);

  // The swap itself, kept short so the two are never both half-there for
  // long: a 50% dark scrim under a 50% cream one is a muddy band, and the
  // only thing worse than the wrong scrim is a smear of both.
  const swapFrom = handover - 6;
  const swapTo = handover + 18;

  // Whether the cover photo has scrolled away. Kept in React state rather
  // than read off the animated value, because what depends on it is the
  // colour of the status bar, and that is a prop rather than a style.
  const [pastHero, setPastHero] = useState(false);
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
    await loadOnboarding();
    setProposals(await loadOpenProposals());
    // The bell counts this too, so Home has to ask the same question the
    // inbox asks. A badge that disagrees with the screen behind it is the one
    // thing a badge must never do.
    setAwaitingReview(await nextAwaitingReview());

    // Only ever comes back when they have shared it. The policy does the
    // gating, so there is nothing to check here beyond which row is theirs.
    // Scoped to the couple and limited rather than maybeSingle(). A couple
    // row is reused when somebody unpairs and repairs, so a leftover answer
    // from an ex used to make this match two rows -- and maybeSingle() errors
    // on two, which this code would have swallowed into a permanently blank
    // card. leaving.sql now deletes those rows; this is the belt.
    const { data: valued } = profile?.couple_id
      ? await supabase
          .from("valued_answers")
          .select(
            "user_id, couple_id, ranking, feels_valued, little_things, hard_week, shared, updated_at"
          )
          .eq("couple_id", profile.couple_id)
          .neq("user_id", session?.user.id ?? "")
          .order("updated_at", { ascending: false })
          .limit(1)
      : { data: null };

    setPartnerValued(((valued as ValuedAnswers[] | null) ?? [])[0] ?? null);
    setPlans(await loadUpcomingPlans());

    // When anything was last put in the diary, which is a different question
    // from what is coming up: a couple who booked a holiday for March did
    // plan something, and a couple whose only plan is in March have an empty
    // fortnight ahead. The nudge needs both answers.
    const { data } = await supabase
      .from("planned_events")
      .select("created_at")
      // Dates only, because couples_due_a_nudge() counts dates only. With
      // one side filtered and the other not, booking the car in for a
      // service silences the card on Home while the push still fires.
      .eq("is_date", true)
      .eq("cancelled", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    setLastPlannedAt(data?.created_at ? new Date(data.created_at as string) : null);
    // loadOnboarding is a useCallback over the profile and the photo urls, so
    // it changes identity when either does. Leaving it out of the deps would
    // pin this to the first render's copy and the bell would stop counting
    // after the first photo was added.
  }, [loadOnboarding]);

  // The same reader Plan a date uses. Worked out twice it would eventually
  // disagree with itself, and "Plan a date offered me a window Home does not
  // show" is exactly the shape of every hard bug this app has had.
  const loadFreeWindows = useCallback(async () => {
    if (!session?.user.id) return;

    const result = await loadFreeWindowsData(session.user.id, profile?.couple_id ?? null, {
      mine: myZone,
      theirs: partnerZone,
    });

    setMyPattern(result.myPattern);
    setFreeWindows(result.windows);
    setNoZoneOverlap(result.noZoneOverlap);
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
  /**
   * Whether the first pass has finished.
   *
   * Every input to the setup list starts empty -- no work pattern, no key
   * dates, no connected calendars -- so on a cold start Home told a couple
   * who finished setting up weeks ago that they had three things left to do,
   * then took it back a second later. It is the first thing on the screen
   * and it was wrong for everybody who had done it.
   */
  const [firstLoadDone, setFirstLoadDone] = useState(false);

  const refreshAll = useCallback(async () => {
    const permissionResult = await Calendar.getCalendarPermissionsAsync();
    setPermission(permissionResult.status);

    if (permissionResult.status === PermissionStatus.GRANTED && session?.user.id) {
      const all = await listCalendars(session.user.id);
      setConnectedCount(all.filter((c) => c.shareLevel !== "off").length);
    }

    await Promise.all([loadKeyDates(), loadPlans()]);

    try {
      if (permissionResult.status === PermissionStatus.GRANTED) {
        await syncAndLoad();
      } else {
        await loadFreeWindows();
      }
    } finally {
      // In a finally, because useRefreshOnFocus swallows rejections: one
      // throw from a calendar sync and the setup card -- the only guidance a
      // new couple gets -- would never appear again this session.
      setFirstLoadDone(true);
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
      // Booked from "Free together" with a tap on Book it. Nobody reaches
      // that button to arrange a dentist appointment.
      isDate: true,
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

  /**
   * Open the date editor at a time you are both actually free.
   *
   * Landing on a real window rather than on 9am tomorrow is the difference
   * between "plan a date" being an invitation and being a form.
   */
  function planADate() {
    tapped();
    router.push("/plan");
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
          const { error } = await cancelPlannedEvent(plan.id, session?.user.id);

          if (error) {
            warned();
            Alert.alert("Couldn't cancel that", error.message);
            return;
          }

          succeeded();
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

  // Only the ones somebody said were dates. The rest are still on the
  // calendar and still in the free-time arithmetic -- an appointment is real
  // time that is taken -- but a section called Upcoming dates that fills up
  // with the car service and the dentist stops being worth looking at.
  const dates = plans.filter((p) => p.is_date);

  // Nothing booked for a fortnight and nothing planned for a fortnight. On
  // Home this only changes the wording of a card that would be there anyway;
  // the same rule drives the push, in supabase/functions/nudge-date.
  // Nothing to nudge about on your own. "It's been a while since you had a
  // date" to somebody who signed up yesterday, alone, is the app talking to
  // itself -- and tapping it lands on a Home screen that is offering to
  // invite somebody, not to book anything.
  const nudging = Boolean(partner) && shouldNudge(dates, lastPlannedAt);

  // The bell's contents. Built from the same facts Home already has, so the
  // count and the screen behind it can never disagree.
  const inbox = buildInbox({
    outstanding,
    keyDates,
    nudging,
    nameFor,
    proposalsForYou: splitProposals(proposals, session?.user.id ?? "").forYou,
    awaitingReview,
  });

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
                : partner
                  ? `No key dates yet. Add ${partnerName}'s birthday or your anniversary to start a countdown.`
                  : "No key dates yet. Add a birthday or an anniversary and it starts counting down."}
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
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming dates</Text>
          {dates.length > 0 ? (
            <Pressable onPress={planADate} hitSlop={8}>
              <Text style={styles.sectionAction}>Plan another</Text>
            </Pressable>
          ) : null}
        </View>

        {dates.length > 0 ? (
          <>
            <View style={{ marginBottom: 24 }}>
              {dates.map((plan) => (
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
        ) : (
          // The empty state IS the feature here. A couple with nothing booked
          // is the couple this app exists for, and an empty section that says
          // nothing is a missed moment rather than a tidy one.
          !partner ? (
          <Pressable style={press(styles.emptyCard)} onPress={() => router.push("/pair")}>
            <Text style={styles.emptyText}>
              Date planning is the half of this that needs two of you. Tap to invite them.
            </Text>
          </Pressable>
        ) : (
          <Pressable style={press(styles.planPrompt)} onPress={planADate}>
            <Text style={styles.planPromptTitle}>
              {nudging
                ? "It\u2019s been a while since you had a date. \uD83E\uDD0D Keep the fire alive. \uD83D\uDD25"
                : "Nothing in the diary yet"}
            </Text>
            <Text style={styles.planPromptBody}>
              {freeWindows.length > 0
                ? `You\u2019re both free ${formatWindow(freeWindows[0]).toLowerCase()}.`
                : "Pick a time and it lands on both your calendars."}
            </Text>
            <View style={styles.planPromptButton}>
              <Text style={styles.planPromptButtonText}>Plan a date</Text>
            </View>
          </Pressable>
          )
        )}
      </View>
    ),
    littleThings: partner ? (
      <View key="littleThings">
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Little things</Text>
          <Link href="/valued" style={styles.sectionAction}>
            {partnerValued ? "Yours" : "Answer"}
          </Link>
        </View>

        {/* Their own sentence wherever there is one. A thing your partner
            said about themselves beats anything this app could write, and a
            rotating quote is invisible by day ten because it is not about
            you and never changes in response to anything. */}
        <View style={styles.littleCard}>
          <Text style={styles.littleText}>
            {partnerPrompt(partnerValued, partnerName, daySeed())?.line ??
              fallbackLine(
                {
                  nextFree: freeWindows[0]?.start ?? null,
                  keyDateIn: live.length > 0 ? daysUntil(live[0].date, live[0].recurring) : null,
                  keyDateTitle: live.length > 0 ? displayTitleFor(live[0], nameFor) : null,
                  partnerAnswered: Boolean(partnerValued),
                  partnerName,
                },
                daySeed()
              )}
          </Text>
        </View>
      </View>
    ) : null,
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

        {!partner ? (
          <Pressable style={press(styles.emptyCard)} onPress={() => router.push("/pair")}>
            <Text style={styles.emptyText}>
              This is the gaps you are both free, so it needs their diary as well as yours. Tap to
              invite them.
            </Text>
          </Pressable>
        ) : permission !== PermissionStatus.GRANTED ? (
          <Pressable style={press(styles.emptyCard)} onPress={requestAccess}>
            <Text style={styles.emptyText}>
              Connect your calendar to see this. Tap to allow it.
            </Text>
          </Pressable>
        ) : connectedCount === 0 ? (
          <Pressable style={press(styles.emptyCard)} onPress={() => router.push("/calendars")}>
            <Text style={styles.emptyText}>
              No calendars shared yet, so there&apos;s nothing to work from. Tap to choose what to
              share.
            </Text>
          </Pressable>
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
  };

  return (
    <View style={{ flex: 1 }}>
    <Animated.ScrollView
      contentContainerStyle={styles.container}
      scrollEventThrottle={16}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
        // The two thresholds are deliberately apart. With one, a finger
        // resting at the crossover flickers the clock between black and
        // white on every pixel of movement.
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const y = e.nativeEvent.contentOffset.y;
          // Dark icons once the cream is most of the way in, light again
          // before it starts to go. The gap between the two thresholds is
          // what stops a finger resting at the crossover from flickering the
          // clock between black and white on every pixel of movement.
          setPastHero((was) => (was ? y > swapFrom + 4 : y > swapTo - 6));
        },
      })}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      }
    >
      {/* Full bleed, so the negative margins undo the page gutter. The top
          bar floats over it rather than sitting above it: a row of buttons
          between the status bar and the photo wastes the best space on the
          screen. */}
      <View style={styles.heroBleed}>
        <HomeHero
          coverUrl={coverUrl}
          myAvatarUrl={myAvatarUrl}
          partnerAvatarUrl={partnerAvatarUrl}
          myName={me.display_name}
          partnerName={partner?.display_name ?? null}
          hasPartner={Boolean(partner)}
          uploading={uploadingCover}
          onChangeCover={changeCover}
        />

        <View style={styles.topBar} pointerEvents="box-none">
          <Link href="/menu" asChild>
            <Pressable style={press(styles.iconButton)} hitSlop={8} accessibilityLabel="Menu">
              <MenuIcon size={22} color={coverUrl ? "#FFFFFF" : t.textPrimary} />
            </Pressable>
          </Link>

          <View style={styles.topBarRight}>
            {/* The bell holds anything skipped during setup, a key date
                inside its own reminder window, and the fortnight nudge. Each
                of those used to be a card on this screen arguing for the same
                space, and a skipped step had nowhere to live at all. */}
            <Link href="/inbox" asChild>
              <Pressable
                style={press(styles.iconButton)}
                hitSlop={8}
                accessibilityLabel={
                  inbox.length === 0
                    ? "Nothing waiting"
                    : inbox.length === 1
                      ? "One thing waiting on you"
                      : `${inbox.length} things waiting on you`
                }
              >
                <BellIcon size={22} color={coverUrl ? "#FFFFFF" : t.textPrimary} />
                <InboxBadge count={inbox.length} />
              </Pressable>
            </Link>

            <Link href="/calendar" asChild>
              <Pressable
                style={press(styles.iconButton)}
                hitSlop={8}
                accessibilityLabel="Shared calendar"
              >
                <CalendarIcon size={22} color={coverUrl ? "#FFFFFF" : t.brand} />
              </Pressable>
            </Link>
          </View>
        </View>
      </View>

      {/* The invitation, where the gate used to be. It sits above everything
          else because it is the one thing that changes what this app is, and
          it goes when they arrive. Not dismissible: there is nowhere else it
          lives, and an offer you can lose by mistake is a wall again. */}
      {!partner ? (
        <Pressable style={press(styles.inviteCard)} onPress={() => router.push("/pair")}>
          <Text style={styles.inviteTitle}>It&apos;s better with both of you</Text>
          <Text style={styles.inviteBody}>
            Everything here works on your own, and none of it goes anywhere when they join -- it
            just stops being only yours. Free together, date planning and the little things need
            two diaries.
          </Text>
          <View style={styles.inviteButton}>
            <Text style={styles.inviteButtonText}>Invite your partner</Text>
          </View>
        </Pressable>
      ) : null}

      {/* A brand-new couple lands here with nothing and no idea what to do
          first. This says so, in order, and disappears as each is done --
          rather than leaving three empty sections to interpret. */}
      {firstLoadDone && setupSteps.length > 0 ? (
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
    </Animated.ScrollView>

    {/* Fully in by the time the hero's own text reaches the status bar, so
        the names never cross the clock. Native-driven, so it does not stutter
        against the scroll it is following. */}
    {/* Dark icons on a dark photograph are unreadable, and the cover photo
        runs under the clock on purpose. So while the photo is up the status
        bar goes light against the dark scrim, and hands back as the photo
        leaves. Without a photo the hero is a pale wash and the ordinary
        colour is right.

        Only while Home is the screen in front of you. expo-status-bar sets
        this imperatively and nothing puts it back on blur, so a Home left
        showing its photo used to hand white icons to every screen you opened
        from it -- a cream calendar with an invisible clock. */}
    {focused ? (
      <StatusBar style={coverUrl && !pastHero ? "light" : t.scheme === "dark" ? "light" : "dark"} />
    ) : null}

    {/* Two scrims, one fading out as the other fades in. The dark one is
        only ever wanted over the photo, so it has no business existing
        without one. */}
    {coverUrl ? (
      <TopScrim
        tone="photo"
        style={{
          opacity: scrollY.interpolate({
            inputRange: [swapFrom, swapTo],
            outputRange: [1, 0],
            extrapolate: "clamp",
          }),
        }}
      />
    ) : null}

    <TopScrim
      style={{
        opacity: scrollY.interpolate({
          // With no photo there is nothing to protect and nothing to spoil,
          // so it behaves as it does on every other screen: in almost at
          // once. Waiting for the handover would leave the couple's names
          // crossing the clock on the empty state, which is the state a new
          // couple and every reviewer sees first.
          inputRange: coverUrl ? [swapFrom, swapTo] : [0, 90],
          outputRange: [0, 1],
          extrapolate: "clamp",
        }),
      }}
    />
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: t.space(6), paddingTop: t.space(14), paddingBottom: 40 },
  // Cancels the page gutter and the status-bar padding, so the hero runs to
  // all three edges while everything below it stays in the grid.
  heroBleed: {
    marginHorizontal: -t.space(6),
    marginTop: -t.space(14),
    marginBottom: t.space(6),
  },
  // The brand colour rather than the accent the setup card uses: this is the
  // one thing on the screen that changes what the app is, and the two of them
  // stacked in the same green read as one long list of chores.
  inviteCard: {
    backgroundColor: t.brandSoft,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(6),
  },
  inviteTitle: { ...t.type.title, color: t.brand, marginBottom: t.space(1) },
  inviteBody: { ...t.type.body, color: t.textSecondary, marginBottom: t.space(4) },
  inviteButton: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingVertical: t.space(3),
    alignItems: "center",
  },
  inviteButtonText: { ...t.type.label, color: t.textOnBrand },
  setupCard: {
    backgroundColor: t.accentSoft,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(6),
  },
  setupTitle: { ...t.type.title, color: t.accent, marginBottom: t.space(1) },
  setupBody: { ...t.type.body, color: t.textSecondary, marginBottom: t.space(3) },
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
  setupStepLabel: { ...t.type.heading, color: t.textPrimary },
  setupStepWhy: { ...t.type.caption, color: t.textSecondary, marginTop: 1 },
  setupChevron: { fontSize: 20, color: t.accent },
  topBarRight: { flexDirection: "row", alignItems: "center", gap: t.space(2) },
  topBar: {
    position: "absolute",
    top: t.space(13),
    left: t.space(5),
    right: t.space(5),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: t.radius.pill,
    // Translucent rather than solid: over a photo a solid white circle is a
    // hole punched in the picture, and over the empty state it disappears
    // into the surface entirely.
    backgroundColor: "rgba(20, 19, 15, 0.28)",
    alignItems: "center",
    justifyContent: "center",
  },
  hoursCard: {
    ...t.card,
    padding: t.space(5),
    marginTop: t.space(4),
    borderLeftWidth: 4,
    borderLeftColor: t.dotWork,
  },
  hoursTitle: { ...t.type.title, color: t.textPrimary },
  cardHeadRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardAction: { ...t.type.label, color: t.accent },
  title: { ...t.type.display, marginBottom: 8, color: t.textPrimary },
  subtitle: { ...t.type.body, color: t.textSecondary, marginBottom: t.space(6) },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: t.space(3),
    marginBottom: t.space(3),
  },
  sectionTitle: { ...t.type.title, color: t.textPrimary },
  sectionAction: { ...t.type.label, color: t.accent, paddingBottom: 2 },
  sectionActions: { flexDirection: "row", gap: t.space(4) },
  // Sunken, not raised. An empty state is a hole in the page, and drawing it
  // as a card promises content that isn't there.
  emptyCard: {
    backgroundColor: t.surfaceSunken,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(6),
  },
  emptyText: { ...t.type.body, color: t.textSecondary },
  keyDateCard: {
    ...t.card,
    padding: t.space(4),
    marginRight: 12,
    width: 140,
  },
  keyDateDays: { ...t.type.title, fontFamily: FONT_DISPLAY_STRONG, color: t.brand, marginBottom: 6 },
  keyDateTitle: { ...t.type.label, color: t.textPrimary },
  keyDateNote: { ...t.type.caption, color: t.textMuted, marginTop: t.space(1) },
  // The pinned countdown. Brand rather than accent, because it is the one
  // thing on Home that is allowed to shout, and the accent is the colour of
  // ordinary actions everywhere else.
  hero: {
    backgroundColor: t.brandSoft,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(4),
  },
  heroCountdown: { ...t.type.hero, color: t.brand },
  heroTitle: { ...t.type.title, color: t.textPrimary, marginTop: 2 },
  heroNote: { ...t.type.caption, color: t.textSecondary, marginTop: t.space(2) },
  planRow: {
    ...t.card,
    padding: t.space(4),
    marginBottom: t.space(2),
    flexDirection: "row",
    alignItems: "center",
  },
  planTitle: { ...t.type.heading, color: t.textPrimary, marginBottom: 2 },
  planWhen: { ...t.type.caption, color: t.textSecondary },
  planCancel: { ...t.type.label, color: t.textMuted, marginLeft: t.space(3) },
  freeRow: { ...t.card, padding: t.space(4), marginBottom: t.space(2) },
  freeRowTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  freeTheirTime: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
  zoneGap: {
    ...t.type.caption,
    color: t.textSecondary,
    backgroundColor: t.accentSoft,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space(3),
    paddingVertical: t.space(2),
    marginBottom: t.space(3),
  },
  freeText: { ...t.type.heading, color: t.textPrimary, flex: 1 },
  bookLink: { ...t.type.label, color: t.accent, marginLeft: t.space(3) },
  bookingBox: { marginTop: t.space(3) },
  input: {
    borderWidth: 1,
    borderColor: t.border,
    borderRadius: t.radius.md,
    paddingHorizontal: t.space(3),
    paddingVertical: t.space(3),
    ...t.type.body,
    color: t.textPrimary,
  },
  bookingHint: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
  bookingActions: { flexDirection: "row", alignItems: "center", marginTop: t.space(3) },
  smallButton: {
    backgroundColor: t.accent,
    borderRadius: t.radius.pill,
    paddingVertical: t.space(3),
    paddingHorizontal: t.space(4),
  },
  smallButtonDisabled: { opacity: 0.6 },
  smallButtonText: { ...t.type.label, color: t.textOnBrand },
  bookingCancel: { ...t.type.label, color: t.textMuted, marginLeft: t.space(4) },
  card: { ...t.card, padding: t.space(5), marginTop: t.space(4) },
  cardTitle: { ...t.type.title, marginBottom: t.space(2), color: t.textPrimary },
  cardBody: { ...t.type.body, color: t.textSecondary, marginBottom: t.space(4) },
  button: {
    backgroundColor: t.accent,
    borderRadius: t.radius.pill,
    paddingVertical: t.space(3),
    alignItems: "center",
  },
  buttonText: { ...t.type.label, color: t.textOnBrand },
  // Brand-tinted rather than a plain card: this is an invitation, and an
  // invitation that looks like every other row is one nobody accepts.
  planPrompt: {
    backgroundColor: t.brandSoft,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(6),
    alignItems: "flex-start",
  },
  planPromptTitle: { ...t.type.title, color: t.textPrimary },
  planPromptBody: { ...t.type.body, color: t.textSecondary, marginTop: t.space(1) },
  planPromptButton: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingVertical: t.space(3),
    paddingHorizontal: t.space(5),
    marginTop: t.space(4),
  },
  planPromptButtonText: { ...t.type.label, color: t.textOnBrand },
  // Quiet on purpose. This sits at the bottom and is read once a day at
  // most, so it earns no shadow and no brand colour.
  littleCard: {
    backgroundColor: t.surfaceSunken,
    borderRadius: t.radius.lg,
    padding: t.space(5),
    marginBottom: t.space(6),
  },
  littleText: { ...t.type.body, color: t.textPrimary },
  link: { textAlign: "center", color: t.textMuted, ...t.type.caption },
  });
