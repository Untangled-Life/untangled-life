import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { press } from "@/components/press";
import { ScreenHeader } from "@/components/screen";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { supabase } from "@/lib/supabase";
import { succeeded, tapped, warned } from "@/lib/haptics";
import { QUESTIONS, ValuedAnswers, ValuedWay, WAYS, wayLabel } from "@/lib/valued";
import { Theme } from "@/theme/tokens";

/**
 * What makes you feel valued.
 *
 * The sharing promise is made on the first screen and kept by the database:
 * nothing here reaches your partner until the switch at the bottom is on, and
 * the row is invisible to them until then. Asking somebody what makes them
 * feel wanted and only mentioning afterwards that it was published is the
 * version of this feature that betrays people.
 *
 * No score. No percentage. No compatibility rating. A number invites a couple
 * to feel bad about a number.
 */
export default function Valued() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile } = useAuth();
  const { partner } = useCoupleMembers();

  const [mine, setMine] = useState<ValuedAnswers | null>(null);
  const [theirs, setTheirs] = useState<ValuedAnswers | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const [ranking, setRanking] = useState<ValuedWay[]>([]);
  const [text, setText] = useState<Record<string, string>>({});
  const [shared, setShared] = useState(false);

  const partnerName = partner?.display_name ?? "your partner";

  const userId = session?.user.id ?? null;
  const coupleId = profile?.couple_id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;

    const { data } = await supabase
      .from("valued_answers")
      .select("user_id, couple_id, ranking, feels_valued, little_things, hard_week, shared, updated_at")
      // A couple row is reused after an unpair, so without this a leftover
      // answer from an ex could be rendered under the new partner's name.
      .eq("couple_id", coupleId ?? "");

    const rows = (data as ValuedAnswers[]) ?? [];
    const own = rows.find((r) => r.user_id === userId) ?? null;
    // Anything that is not yours came back only because they shared it. The
    // policy does the filtering; this just picks it out.
    const other = rows.find((r) => r.user_id !== userId) ?? null;

    setMine(own);
    setTheirs(other);

    if (own) {
      setRanking(own.ranking ?? []);
      setShared(own.shared);
      setText({
        feels_valued: own.feels_valued ?? "",
        little_things: own.little_things ?? "",
        hard_week: own.hard_week ?? "",
      });
    }

    setLoaded(true);
  }, [userId, coupleId]);

  useRefreshOnFocus(load);

  function toggleWay(key: ValuedWay) {
    tapped();
    setRanking((r) => (r.includes(key) ? r.filter((x) => x !== key) : [...r, key]));
  }

  /**
   * Returns whether it stuck.
   *
   * The sharing switch has to know: leaving it showing "on" after a failed
   * write tells somebody their most private answers have reached their
   * partner when they have not, which is the wrong direction to fail in for
   * this table above all others.
   */
  async function save(nextShared = shared): Promise<boolean> {
    if (!session?.user.id || !profile?.couple_id || saving) return false;

    setSaving(true);
    const { error } = await supabase.from("valued_answers").upsert(
      {
        user_id: session.user.id,
        couple_id: profile.couple_id,
        ranking,
        feels_valued: text.feels_valued?.trim() || null,
        little_things: text.little_things?.trim() || null,
        hard_week: text.hard_week?.trim() || null,
        shared: nextShared,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);

    if (error) {
      warned();
      Alert.alert("Couldn't save that", error.message);
      return false;
    }

    succeeded();
    await load();
    return true;
  }

  /**
   * Whether what is on screen differs from what is stored.
   *
   * Derived from the saved row rather than tracked alongside it, because
   * save() reloads from the database when it finishes -- so the row IS the
   * record of what was saved, and a separate copy of it could only ever go
   * out of step and start saying "Saved" over unsaved words.
   *
   * Trimmed on both sides, because that is what gets written.
   */
  const dirty =
    !mine ||
    (mine.ranking ?? []).join("|") !== ranking.join("|") ||
    (mine.feels_valued ?? "") !== (text.feels_valued?.trim() ?? "") ||
    (mine.little_things ?? "") !== (text.little_things?.trim() ?? "") ||
    (mine.hard_week ?? "") !== (text.hard_week?.trim() ?? "") ||
    mine.shared !== shared;

  // Three states rather than two. "Save" before there is anything stored,
  // "Update" once there is and you have changed something, and "Saved" when
  // the two agree -- which is the only one of the three that is a statement
  // rather than an instruction, so it does not behave like a button.
  const saveLabel = saving ? "Saving..." : !mine ? "Save" : dirty ? "Update" : "Saved";

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <ScreenHeader
        title="Feeling valued"
        back="Menu"
        intro={`A few questions about what makes you feel wanted. ${partnerName} will read your answers, which is the whole point, and none of it reaches them until you turn sharing on at the bottom.`}
      />

      <Text style={styles.groupTitle}>Which of these lands hardest</Text>
      <Text style={styles.groupHint}>
        Tap them in order, favourite first. Everybody wants all five sometimes, so this is about
        which one you notice when it is missing.
      </Text>

      <View style={styles.ways}>
        {WAYS.map((w) => {
          const at = ranking.indexOf(w.key);
          return (
            <Pressable
              key={w.key}
              onPress={() => toggleWay(w.key)}
              style={press([styles.way, at >= 0 ? styles.wayOn : null])}
              accessibilityRole="button"
              accessibilityState={{ selected: at >= 0 }}
            >
              <View style={[styles.rank, at >= 0 ? styles.rankOn : null]}>
                <Text style={[styles.rankText, at >= 0 ? styles.rankTextOn : null]}>
                  {at >= 0 ? at + 1 : ""}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.wayLabel}>{w.label}</Text>
                <Text style={styles.wayBlurb}>{w.blurb}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>

      {QUESTIONS.map((q) => (
        <View key={q.key} style={styles.question}>
          <Text style={styles.groupTitle}>{q.prompt}</Text>
          <Text style={styles.groupHint}>{q.hint}</Text>
          <TextInput
            style={styles.input}
            placeholder={q.placeholder}
            placeholderTextColor={t.textMuted}
            multiline
            value={text[q.key] ?? ""}
            onChangeText={(v) => setText((s) => ({ ...s, [q.key]: v }))}
          />
        </View>
      ))}

      <View style={styles.shareCard}>
        <View style={{ flex: 1 }}>
          <Text style={styles.shareTitle}>Share with {partnerName}</Text>
          <Text style={styles.shareBody}>
            {shared
              ? `${partnerName} can read these, and one of them turns up on their home screen now and then.`
              : `Nothing above has reached ${partnerName}. Turn this on when you are ready.`}
          </Text>
        </View>
        <Switch
          value={shared}
          onValueChange={async (v) => {
            setShared(v);
            // Put it back if the write did not land, so the control never
            // claims something the database does not agree with.
            if (!(await save(v))) setShared(!v);
          }}
          trackColor={{ true: t.accent, false: t.surfaceSunken }}
        />
      </View>

      <Pressable
        style={press([styles.save, !dirty && !saving ? styles.saveDone : null])}
        onPress={() => save()}
        disabled={saving || !dirty}
        accessibilityRole="button"
        accessibilityState={{ disabled: saving || !dirty }}
      >
        <Text style={[styles.saveText, !dirty && !saving ? styles.saveDoneText : null]}>
          {!dirty && !saving ? `\u2713  ${saveLabel}` : saveLabel}
        </Text>
      </Pressable>

      {/* Said once, under the button, because the button now goes quiet when
          there is nothing to do and a disabled control can read as a door
          that has closed. These are answers about a person, and people
          change. */}
      <Text style={styles.changeNote}>
        Answers can be changed or updated whenever you like.
      </Text>

      {theirs ? (
        <View style={styles.theirs}>
          <Text style={styles.groupTitle}>What {partnerName} said</Text>
          {theirs.ranking?.length > 0 ? (
            <Text style={styles.theirRanking}>
              {theirs.ranking.map(wayLabel).slice(0, 3).join(", ")}
            </Text>
          ) : null}
          {QUESTIONS.map((q) => {
            const answer = theirs[q.key];
            if (!answer) return null;
            return (
              <View key={q.key} style={styles.theirAnswer}>
                <Text style={styles.theirPrompt}>{q.prompt}</Text>
                <Text style={styles.theirText}>{answer}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <Text style={styles.footnote}>
          {mine?.shared
            ? `${partnerName} has not answered these yet. Yours is waiting for them.`
            : `You will see ${partnerName}'s answers here once they share them.`}
        </Text>
      )}
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg },
    container: {
      flexGrow: 1,
      backgroundColor: t.bg,
      paddingHorizontal: t.space(6),
      paddingTop: t.space(16),
      paddingBottom: t.space(12),
    },
    groupTitle: { ...t.type.title, color: t.textPrimary, marginTop: t.space(5) },
    groupHint: { ...t.type.body, color: t.textSecondary, marginTop: t.space(1) },

    ways: { marginTop: t.space(3), gap: t.space(2) },
    way: {
      ...t.card,
      padding: t.space(4),
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(3),
    },
    wayOn: { borderColor: t.accent, borderWidth: 1.5 },
    rank: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 1.5,
      borderColor: t.border,
      alignItems: "center",
      justifyContent: "center",
    },
    rankOn: { backgroundColor: t.accent, borderColor: t.accent },
    rankText: { ...t.type.label, color: t.textMuted },
    rankTextOn: { color: t.textOnBrand },
    wayLabel: { ...t.type.heading, color: t.textPrimary },
    wayBlurb: { ...t.type.caption, color: t.textSecondary, marginTop: 2 },

    question: { marginBottom: t.space(2) },
    input: {
      ...t.card,
      marginTop: t.space(3),
      padding: t.space(4),
      minHeight: 88,
      textAlignVertical: "top",
      ...t.type.body,
      color: t.textPrimary,
    },

    shareCard: {
      ...t.card,
      padding: t.space(5),
      marginTop: t.space(7),
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(4),
    },
    shareTitle: { ...t.type.title, color: t.textPrimary },
    shareBody: { ...t.type.caption, color: t.textSecondary, marginTop: t.space(1) },

    save: {
      backgroundColor: t.accent,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(4),
      alignItems: "center",
      marginTop: t.space(4),
    },
    saveText: { ...t.type.label, color: t.textOnBrand },
    // Saved is a receipt, not an action. A filled button that does nothing
    // teaches people not to trust the filled buttons.
    saveDone: { backgroundColor: t.accentSoft },
    saveDoneText: { color: t.accent },

    theirs: { marginTop: t.space(8) },
    theirRanking: { ...t.type.body, color: t.accent, marginTop: t.space(2) },
    theirAnswer: { marginTop: t.space(4) },
    theirPrompt: { ...t.type.eyebrow, color: t.textMuted },
    theirText: { ...t.type.body, color: t.textPrimary, marginTop: t.space(1) },
    changeNote: { ...t.type.caption, color: t.textMuted, marginTop: t.space(3), textAlign: "center" },
    // A size up from the note above it, and a size up from what it used to
    // be. It is about the two of you rather than about the form, so it
    // should not read as small print sitting under the small print.
    footnote: { ...t.type.body, color: t.textSecondary, marginTop: t.space(8) },
  });
