import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { succeeded, tapped, warned } from "@/lib/haptics";
import { Interval, formatWindow } from "@/lib/freeTime";
import { CATEGORIES, DateIdea, IdeaCategory, IDEAS, filterIdeas, spreadOptions } from "@/lib/dateIdeas";
import { createProposal } from "@/lib/dateProposals";
import { loadFreeWindows } from "@/lib/freeWindows";
import { LovedDate, howLongAgo } from "@/lib/dateHistory";
import { lovedTogether } from "@/lib/dateReviews";
import { localZone } from "@/lib/timezone";
import { suggestedSlot } from "@/lib/dateNudge";
import { Theme } from "@/theme/tokens";

/**
 * Planning a date.
 *
 * The reason couples do not plan anything is rarely that they cannot find a
 * time. It is the blank page: "what do you want to do" answered with "I don't
 * mind" by both people until the evening is gone. So this screen never shows
 * an empty field. It shows things to do, filtered to what actually fits the
 * gaps you have.
 *
 * Two ways out of every idea, and the difference matters. BOOK IT puts it in
 * both diaries now, which is right when you already know they are free.
 * PROPOSE offers two or three times and waits, which is right the rest of the
 * time and is the thing this app could not do before: going first without
 * committing the other person to a time they have not seen.
 */
export default function Plan() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile } = useAuth();
  const { partner } = useCoupleMembers();

  const [windows, setWindows] = useState<Interval[]>([]);
  const [chosen, setChosen] = useState<IdeaCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loved, setLoved] = useState<LovedDate[]>([]);

  const partnerName = partner?.display_name ?? "your partner";

  // The same two zones Home uses, so a window offered here is a window shown
  // there. Defaulting to this device rather than UTC: the profile that has not
  // reported a zone yet is almost certainly beside you.
  const myZone = profile?.time_zone ?? localZone();
  const partnerZone = partner?.time_zone ?? null;

  // The free windows are worked out on Home and passed nowhere, so this reads
  // them again rather than plumbing them through a route param where they
  // would arrive as a stale string.
  const load = useCallback(async () => {
    setLoading(true);
    const result = await loadFreeWindows(session?.user.id ?? null, profile?.couple_id ?? null, {
      mine: myZone,
      theirs: partnerZone,
    });
    setWindows(result.windows);
    setLoved(await lovedTogether());
    setLoading(false);
  }, [session?.user.id, profile?.couple_id, myZone, partnerZone]);

  useRefreshOnFocus(load);

  // The longest gap there is, so a day trip is offered when there is a day and
  // held back when there is an hour.
  const longest = useMemo(
    () =>
      windows.reduce(
        (most, w) => Math.max(most, (w.end.getTime() - w.start.getTime()) / 60000),
        0
      ),
    [windows]
  );

  const ideas = useMemo(
    () =>
      filterIdeas(IDEAS, {
        categories: chosen.length > 0 ? chosen : undefined,
        // No windows at all is not a reason to show nothing: they can still
        // propose times, and an empty screen would suggest the app has run
        // out of ideas rather than out of gaps.
        maxMinutes: longest > 0 ? Math.max(longest, 120) : undefined,
      }),
    [chosen, longest]
  );

  function toggle(key: IdeaCategory) {
    tapped();
    setChosen((c) => (c.includes(key) ? c.filter((x) => x !== key) : [...c, key]));
  }

  /** Straight into the editor, pre-filled, at a window you are both free. */
  function bookIt(idea: DateIdea) {
    tapped();
    const slot = suggestedSlot(windows);
    router.push({
      pathname: "/event",
      params: { ...slot, title: idea.title, minutes: String(idea.minutes) },
    });
  }

  async function propose(idea: DateIdea) {
    if (!session?.user.id || !profile?.couple_id || busy) return;

    const options = spreadOptions(
      windows.filter((w) => (w.end.getTime() - w.start.getTime()) / 60000 >= idea.minutes)
    );

    if (options.length === 0) {
      warned();
      Alert.alert(
        "No gap long enough",
        `${idea.title} wants about ${Math.round(idea.minutes / 60)} hours and there isn't a window that long in the next week. Book it anyway and pick your own time, or try a shorter one.`
      );
      return;
    }

    setBusy(idea.id);
    const { error } = await createProposal({
      coupleId: profile.couple_id,
      userId: session.user.id,
      title: idea.title,
      note: idea.blurb,
      options,
    });
    setBusy(null);

    if (error) {
      warned();
      Alert.alert("Couldn't send that", error.message);
      return;
    }

    succeeded();
    Alert.alert(
      "Sent",
      `${partnerName} gets ${options.length === 1 ? "the time" : `${options.length} times`} to pick from. It lands in both diaries once they choose.`
    );
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ScreenHeader
        title="Plan a date"
        back="Home"
        intro={
          windows.length > 0
            ? `Everything here fits a gap you're both actually free. Book it, or offer ${partnerName} a few times to pick from.`
            : "Nothing here needs a free window to suggest. Book one and pick your own time."
        }
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {CATEGORIES.map((c) => {
          const on = chosen.includes(c.key);
          return (
            <Pressable
              key={c.key}
              onPress={() => toggle(c.key)}
              style={press([styles.chip, on ? styles.chipOn : null])}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* The only suggestion this app has earned rather than written. Both of
          you said you loved it, which is a much stronger signal than one of
          you having done so. */}
      {loved.length > 0 && chosen.length === 0 ? (
        <View style={styles.again}>
          <Text style={styles.againTitle}>You both loved these</Text>
          {loved.slice(0, 3).map((l) => (
            <Pressable
              key={l.planned_event_id}
              style={press(styles.againRow)}
              onPress={() => {
                tapped();
                router.push({
                  pathname: "/event",
                  params: { ...suggestedSlot(windows), title: l.title },
                });
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.againName}>{l.title}</Text>
                <Text style={styles.againWhen}>{howLongAgo(l.last_at)}</Text>
              </View>
              <Text style={styles.againAction}>Again</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : (
        <View style={styles.list}>
          {ideas.map((idea) => (
            <View key={idea.id} style={styles.idea}>
              <Text style={styles.ideaTitle}>{idea.title}</Text>
              <Text style={styles.ideaBlurb}>{idea.blurb}</Text>
              <Text style={styles.ideaMeta}>
                {idea.minutes >= 480
                  ? "Most of a day"
                  : `About ${Math.round(idea.minutes / 60)} hours`}
                {idea.cost === "free" ? " · Free" : idea.cost === "low" ? " · Cheap" : ""}
              </Text>

              <View style={styles.ideaActions}>
                <Pressable style={press(styles.primary)} onPress={() => bookIt(idea)}>
                  <Text style={styles.primaryText}>Book it</Text>
                </Pressable>
                <Pressable
                  style={press(styles.secondary)}
                  onPress={() => propose(idea)}
                  disabled={busy === idea.id}
                >
                  <Text style={styles.secondaryText}>
                    {busy === idea.id ? "Sending…" : `Ask ${partnerName.split(" ")[0]}`}
                  </Text>
                </Pressable>
              </View>
            </View>
          ))}

          {ideas.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Nothing in those categories fits the time you have. Try another, or book something
                and pick your own time.
              </Text>
            </View>
          ) : null}
        </View>
      )}

      <Pressable
        style={press(styles.own)}
        onPress={() => router.push({ pathname: "/event", params: suggestedSlot(windows) })}
      >
        <Text style={styles.ownText}>Something else entirely</Text>
      </Pressable>
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
    chipScroll: { marginHorizontal: -t.space(1), marginBottom: t.space(5) },
    chip: {
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(2),
      borderRadius: t.radius.pill,
      backgroundColor: t.surfaceSunken,
      marginHorizontal: t.space(1),
    },
    chipOn: { backgroundColor: t.accentSoft },
    chipText: { ...t.type.label, color: t.textSecondary },
    chipTextOn: { color: t.accent },

    again: {
      backgroundColor: t.accentSoft,
      borderRadius: t.radius.lg,
      padding: t.space(5),
      marginBottom: t.space(5),
    },
    againTitle: { ...t.type.title, color: t.accent, marginBottom: t.space(2) },
    againRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: t.space(3),
      gap: t.space(3),
    },
    againName: { ...t.type.heading, color: t.textPrimary },
    againWhen: { ...t.type.caption, color: t.textSecondary, marginTop: 1 },
    againAction: { ...t.type.label, color: t.accent },

    list: { gap: t.space(3) },
    idea: { ...t.card, padding: t.space(5) },
    ideaTitle: { ...t.type.title, color: t.textPrimary },
    ideaBlurb: { ...t.type.body, color: t.textSecondary, marginTop: t.space(1) },
    ideaMeta: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
    ideaActions: { flexDirection: "row", gap: t.space(3), marginTop: t.space(4) },
    primary: {
      backgroundColor: t.brand,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(3),
      paddingHorizontal: t.space(5),
    },
    primaryText: { ...t.type.label, color: t.textOnBrand },
    secondary: {
      borderRadius: t.radius.pill,
      paddingVertical: t.space(3),
      paddingHorizontal: t.space(5),
      borderWidth: 1,
      borderColor: t.border,
    },
    secondaryText: { ...t.type.label, color: t.textSecondary },

    empty: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(5),
    },
    emptyText: { ...t.type.body, color: t.textSecondary },

    own: { alignItems: "center", paddingVertical: t.space(5), marginTop: t.space(4) },
    ownText: { ...t.type.label, color: t.accent },
  });
