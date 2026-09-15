import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles } from "@/contexts/theme";
import { succeeded, tapped, warned } from "@/lib/haptics";
import { Interval, formatWindow } from "@/lib/freeTime";
import {
  CATEGORIES,
  DateIdea,
  IDEAS,
  IdeaCategory,
  daySeed,
  filterIdeas,
  lengthLabel,
  spreadOptions,
} from "@/lib/dateIdeas";
import { hasPreferences, rankIdeas, verdictsByTitle, type RankedIdea } from "@/lib/ideaRanking";
import { loadPartnerValued, loadSavedIdeas, loadVerdictRows, saveIdea, unsaveIdea } from "@/lib/ideaData";
import { ValuedAnswers, partnerPrompt } from "@/lib/valued";
import { BookmarkIcon } from "@/components/icons";
import { useTheme } from "@/contexts/theme";
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
  const { session, profile } = useAuth();
  const { partner } = useCoupleMembers();

  const [windows, setWindows] = useState<Interval[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [loved, setLoved] = useState<LovedDate[]>([]);

  // The list is closed until asked for. A hundred ideas on the screen the
  // moment it opens is a menu with no headings; one button and four choices
  // is a question with an answer.
  const [panel, setPanel] = useState<"closed" | "pick" | IdeaCategory>("closed");

  // What sorts the list: their answers, what you both said about past dates,
  // and what either of you has saved.
  const [answers, setAnswers] = useState<ValuedAnswers | null>(null);
  const [verdicts, setVerdicts] = useState(() => verdictsByTitle([]));
  const [saved, setSaved] = useState<string[]>([]);

  const partnerName = partner?.display_name ?? "your partner";
  // "your partner" is a sentence fragment, and taking its first word gave a
  // button reading "Ask your".
  const partnerFirstName = partner?.display_name?.split(" ")[0] ?? "them";

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

    const [lovedRows, valued, verdictRows, savedIds] = await Promise.all([
      lovedTogether(),
      loadPartnerValued(profile?.couple_id ?? null, session?.user.id ?? null),
      loadVerdictRows(),
      loadSavedIdeas(),
    ]);
    setLoved(lovedRows);
    setAnswers(valued);
    setVerdicts(verdictsByTitle(verdictRows));
    setSaved(savedIds);
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

  const category = panel === "closed" || panel === "pick" ? null : panel;

  // Filtered to the category and the time there is, then sorted around what
  // your partner said. The sort is the whole point of asking them.
  const ideas: RankedIdea[] = useMemo(() => {
    if (!category) return [];
    const fitting = filterIdeas(IDEAS, {
      categories: [category],
      // No windows at all is not a reason to show nothing: they can still
      // propose times, and an empty screen would suggest the app has run
      // out of ideas rather than out of gaps.
      // The real longest gap, with no floor under it. Raising a 45-minute
      // window to 120 offered two-hour ideas under a heading promising
      // everything fits, and tapping one then hit "no gap long enough" --
      // the app arguing with itself.
      maxMinutes: longest > 0 ? longest : undefined,
    });
    return rankIdeas(fitting, answers, partnerFirstName, verdicts, daySeed());
  }, [category, longest, answers, partnerFirstName, verdicts]);

  // Saved ones, in the order they were saved, whatever category they are in.
  const savedIdeas = useMemo(
    () =>
      saved
        .map((id) => IDEAS.find((idea) => idea.id === id))
        .filter((idea): idea is DateIdea => Boolean(idea)),
    [saved]
  );

  const sorted = hasPreferences(answers);
  const theirWords = partnerPrompt(answers, partnerFirstName, daySeed());

  /** Save or unsave, optimistically, and put it back if the write fails. */
  async function toggleSave(idea: DateIdea) {
    if (!profile?.couple_id || !session?.user.id) return;
    tapped();

    const wasSaved = saved.includes(idea.id);
    setSaved((s) => (wasSaved ? s.filter((id) => id !== idea.id) : [idea.id, ...s]));

    const { error } = wasSaved
      ? await unsaveIdea(profile.couple_id, idea.id)
      : await saveIdea(profile.couple_id, session.user.id, idea.id);

    if (error) {
      setSaved((s) => (wasSaved ? [idea.id, ...s] : s.filter((id) => id !== idea.id)));
      warned();
      Alert.alert(wasSaved ? "Couldn't remove that" : "Couldn't save that", error.message);
    }
  }

  /** Straight into the editor, pre-filled, at a window you are both free. */
  function bookIt(idea: DateIdea) {
    tapped();
    const slot = suggestedSlot(windows);
    router.push({
      pathname: "/event",
      // Arriving from the ideas screen, so the toggle starts on. Somebody
      // who taps Book it under "Cocktails at the place on the corner" is not
      // arranging a dentist appointment, and a date booked here that never
      // reached Upcoming dates was the section staying empty at the exact
      // moment it was used.
      params: { ...slot, title: idea.title, minutes: String(idea.minutes), isDate: "1" },
    });
  }

  async function propose(idea: DateIdea) {
    if (!session?.user.id || !profile?.couple_id || busy) return;

    // Trimmed to what the idea actually wants. The free window is where it
    // COULD go, not how long it takes: proposing the whole of a Saturday
    // 10am to 6pm gap for a one-hour coffee books an eight-hour coffee in
    // both diaries the moment they accept.
    const options = spreadOptions(
      windows.filter((w) => (w.end.getTime() - w.start.getTime()) / 60000 >= idea.minutes)
    ).map((w) => ({
      start: w.start,
      end: new Date(w.start.getTime() + idea.minutes * 60 * 1000),
    }));

    if (options.length === 0) {
      warned();
      Alert.alert(
        "No gap long enough",
        `${idea.title} wants ${lengthLabel(idea.minutes).replace(/^About /, "about ").toLowerCase()} and there isn't a window that long in the next week. Book it anyway and pick your own time, or try a shorter one.`
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

      {windows.length > 0 ? (
        <View style={styles.gaps}>
          <Text style={styles.gapsLabel}>Gaps you both have</Text>
          <Text style={styles.gapsList}>
            {windows
              .slice(0, 3)
              .map((w) => formatWindow(w))
              .join("\n")}
          </Text>
        </View>
      ) : null}

      {/* The only suggestion this app has earned rather than written. Both of
          you said you loved it, which is a much stronger signal than one of
          you having done so. */}
      {loved.length > 0 && panel === "closed" ? (
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
                  // The one suggestion this app has earned, and without
                  // this it booked as an appointment: never in Upcoming
                  // dates, never asked about, and no help against the
                  // fortnight nudge. Same flag Book it sets above.
                  params: { ...suggestedSlot(windows), title: l.title, isDate: "1" },
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

      {/* Saved for later, by either of you. Above the button rather than
          inside a category, because the point of saving something is that
          it is there next time without hunting for it. */}
      {savedIdeas.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Wants to try</Text>
          {savedIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              why={null}
              saved
              busy={busy === idea.id}
              partnerFirstName={partnerFirstName}
              onBook={() => bookIt(idea)}
              onAsk={() => propose(idea)}
              onSave={() => toggleSave(idea)}
            />
          ))}
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} />
      ) : panel === "closed" ? (
        <Pressable
          style={press(styles.ideasButton)}
          onPress={() => {
            tapped();
            setPanel("pick");
          }}
          accessibilityRole="button"
        >
          <Text style={styles.ideasButtonText}>Date ideas</Text>
          <Text style={styles.ideasButtonHint}>
            {IDEAS.length} of them, sorted around what {partnerFirstName} said.
          </Text>
        </Pressable>
      ) : panel === "pick" ? (
        <View style={styles.tiles}>
          {CATEGORIES.map((c) => (
            <Pressable
              key={c.key}
              style={press(styles.tile)}
              onPress={() => {
                tapped();
                setPanel(c.key);
              }}
              accessibilityRole="button"
            >
              <Text style={styles.tileLabel}>{c.label}</Text>
              <Text style={styles.tileBlurb}>{c.blurb}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.listHeader}>
            <Text style={styles.sectionTitle}>
              {CATEGORIES.find((c) => c.key === category)?.label}
            </Text>
            <Pressable
              onPress={() => {
                tapped();
                setPanel("pick");
              }}
              hitSlop={8}
            >
              <Text style={styles.sectionAction}>Change</Text>
            </Pressable>
          </View>

          {/* Their own words, at the top of the list they are sorting. A
              thing your partner said about themselves beats any heading. */}
          {theirWords ? (
            <View style={styles.words}>
              <Text style={styles.wordsText}>{theirWords.line}</Text>
            </View>
          ) : !sorted ? (
            <View style={styles.words}>
              <Text style={styles.wordsText}>
                When {partnerFirstName} answers what makes them feel valued, these sort themselves
                around it.
              </Text>
            </View>
          ) : null}

          {ideas.map(({ idea, why }) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              why={why}
              saved={saved.includes(idea.id)}
              busy={busy === idea.id}
              partnerFirstName={partnerFirstName}
              onBook={() => bookIt(idea)}
              onAsk={() => propose(idea)}
              onSave={() => toggleSave(idea)}
            />
          ))}

          {ideas.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                Nothing in here fits the time you have. Try another, or book something and pick
                your own time.
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

/**
 * One idea. The reason it is here, if there is one, sits under the blurb in
 * the accent colour, so a list that has sorted itself explains itself.
 */
function IdeaCard({
  idea,
  why,
  saved,
  busy,
  partnerFirstName,
  onBook,
  onAsk,
  onSave,
}: {
  idea: DateIdea;
  why: string | null;
  saved: boolean;
  busy: boolean;
  partnerFirstName: string;
  onBook: () => void;
  onAsk: () => void;
  onSave: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const meta = [
    lengthLabel(idea.minutes),
    idea.cost === "free" ? "Free" : idea.cost === "low" ? "Cheap" : null,
    idea.categories.includes("active") ? "Outdoors" : null,
    idea.categories.includes("new") ? "First time for both" : null,
  ]
    .filter(Boolean)
    .join(" \u00b7 ");

  return (
    <View style={styles.idea}>
      <View style={styles.ideaTop}>
        <Text style={[styles.ideaTitle, { flex: 1 }]}>{idea.title}</Text>
        <Pressable
          onPress={onSave}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={saved ? "Remove from wants to try" : "Save for later"}
          accessibilityState={{ selected: saved }}
          style={press(styles.saveTap)}
        >
          <BookmarkIcon size={20} color={saved ? t.accent : t.textMuted} filled={saved} />
        </Pressable>
      </View>
      <Text style={styles.ideaBlurb}>{idea.blurb}</Text>
      <Text style={styles.ideaMeta}>{meta}</Text>
      {why ? <Text style={styles.ideaWhy}>{why}</Text> : null}

      <View style={styles.ideaActions}>
        <Pressable style={press(styles.primary)} onPress={onBook}>
          <Text style={styles.primaryText}>Book it</Text>
        </Pressable>
        <Pressable style={press(styles.secondary)} onPress={onAsk} disabled={busy}>
          <Text style={styles.secondaryText}>{busy ? "Sending..." : `Ask ${partnerFirstName}`}</Text>
        </Pressable>
      </View>
    </View>
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
    gaps: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(4),
      marginBottom: t.space(4),
    },
    gapsLabel: { ...t.type.eyebrow, color: t.textMuted, marginBottom: t.space(2) },
    gapsList: { ...t.type.body, color: t.textPrimary },
    ideasButton: {
      backgroundColor: t.brand,
      borderRadius: t.radius.lg,
      paddingVertical: t.space(6),
      paddingHorizontal: t.space(5),
      alignItems: "center",
      marginBottom: t.space(5),
    },
    ideasButtonText: { ...t.type.title, color: t.textOnBrand },
    ideasButtonHint: { ...t.type.caption, color: t.textOnBrand, opacity: 0.85, marginTop: t.space(1) },
    // Two by two. Four in a column is a list again.
    tiles: { flexDirection: "row", flexWrap: "wrap", gap: t.space(3), marginBottom: t.space(5) },
    tile: {
      ...t.card,
      flexBasis: "47%",
      flexGrow: 1,
      padding: t.space(5),
      minHeight: 112,
      justifyContent: "flex-end",
    },
    tileLabel: { ...t.type.title, color: t.textPrimary },
    tileBlurb: { ...t.type.caption, color: t.textSecondary, marginTop: t.space(1) },
    section: { marginBottom: t.space(5), gap: t.space(3) },
    listHeader: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
    sectionTitle: { ...t.type.title, color: t.textPrimary },
    sectionAction: { ...t.type.label, color: t.accent, paddingBottom: 2 },
    words: {
      backgroundColor: t.accentSoft,
      borderRadius: t.radius.lg,
      padding: t.space(4),
    },
    wordsText: { ...t.type.body, color: t.accent },

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

    idea: { ...t.card, padding: t.space(5) },
    ideaTop: { flexDirection: "row", alignItems: "flex-start", gap: t.space(3) },
    ideaTitle: { ...t.type.title, color: t.textPrimary },
    // Padding rather than a bare icon, so the tap target is 44pt without the
    // icon itself growing.
    saveTap: { padding: t.space(3), margin: -t.space(3) },
    ideaBlurb: { ...t.type.body, color: t.textSecondary, marginTop: t.space(1) },
    ideaMeta: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
    ideaWhy: { ...t.type.caption, color: t.accent, marginTop: t.space(2) },
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
