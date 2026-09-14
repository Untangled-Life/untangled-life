import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { press } from "@/components/press";
import { Avatar } from "@/components/avatar";
import { CheckSquareIcon, ChevronRightIcon } from "@/components/icons";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { useCouplePhotos } from "@/hooks/useCouplePhotos";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { pickPhoto, uploadPhoto, removePhoto } from "@/lib/photos";
import { supabase } from "@/lib/supabase";
import { succeeded, tapped, warned } from "@/lib/haptics";
import { deviceTimeZone } from "@/lib/timezone";
import { WEEKDAYS_DEFAULT, weeklyShifts } from "@/lib/onboarding";
import { weekdayLabel } from "@/lib/workHours";
import { Theme } from "@/theme/tokens";

/**
 * The walkthrough.
 *
 * A hub, not a tunnel. Each step either happens here or hands off to the
 * screen that already does it properly and comes back -- building a second,
 * simpler Calendars screen inside a wizard would mean two screens to keep in
 * step, and the simpler one would be wrong about something within a month.
 *
 * Nothing is compulsory. Four screens between somebody and the app they just
 * signed up for is how you lose them at the door, so every step can be
 * skipped and the whole thing can be left. What is skipped is not forgotten:
 * it stays under the bell on Home.
 *
 * Position is derived, never stored. Every one of these can be done from
 * somewhere else, so an index would be wrong the moment it was.
 */
export default function Welcome() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile } = useAuth();
  const { partner } = useCoupleMembers();
  const { myAvatarUrl, coverUrl, reload: reloadPhotos } = useCouplePhotos();
  const { steps, next, complete, progress, loaded, load, dismiss, finish } = useOnboarding();

  const [busy, setBusy] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);

  /**
   * Steps skipped during THIS visit, held here rather than in the database.
   *
   * A skip should move you along now and be forgotten by tomorrow, so the bell
   * can raise it again. Persisting it would make "later" mean "never", which
   * is the opposite of what the button says. Nothing outside this screen reads
   * it, so the bell and Home still count a skipped step as outstanding.
   */
  const [skipped, setSkipped] = useState<string[]>([]);

  useRefreshOnFocus(load);

  const partnerName = partner?.display_name ?? "your partner";

  // The step being offered: the first that is neither finished nor waved past
  // a moment ago. Derived, so finishing one elsewhere and coming back lands on
  // the right one without this screen tracking an index.
  const active = steps.find((s) => !s.done && !skipped.includes(s.key)) ?? null;

  // Everything either finished or waved past. Different from `complete`, which
  // means genuinely finished: the difference is what the bell will be holding
  // when they get to Home.
  const settled = active === null;

  async function leave() {
    await finish();
    router.replace("/");
  }

  const addPhoto = useCallback(
    async (kind: "avatar" | "cover") => {
      if (!session?.user.id || !profile?.couple_id || busy) return;

      const { photo, error } = await pickPhoto(kind);
      if (error) {
        warned();
        Alert.alert("Couldn't use that photo", error);
        return;
      }
      if (!photo) return;

      setBusy(true);
      const upload = await uploadPhoto(kind, kind === "cover" ? profile.couple_id : session.user.id, photo);

      if (upload.error || !upload.path) {
        setBusy(false);
        warned();
        Alert.alert("Couldn't save that photo", upload.error ?? "Please try again.");
        return;
      }

      const previous = kind === "cover" ? null : profile.avatar_path;

      const { error: saveError } =
        kind === "cover"
          ? await supabase
              .from("couples")
              .update({ cover_path: upload.path })
              .eq("id", profile.couple_id)
          : await supabase
              .from("profiles")
              .update({ avatar_path: upload.path })
              .eq("id", session.user.id);

      if (saveError) {
        setBusy(false);
        warned();
        Alert.alert("Couldn't save that photo", saveError.message);
        return;
      }

      if (previous) await removePhoto(previous);
      await reloadPhotos();
      await load();
      setBusy(false);
      succeeded();
    },
    [session?.user.id, profile?.couple_id, profile?.avatar_path, busy, reloadPhotos, load]
  );

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.eyebrow}>
        {complete
          ? "All set"
          : settled
            ? "Ready when you are"
            : `Step ${progress.done + 1} of ${progress.total}`}
      </Text>
      <Text style={styles.title}>
        {complete ? "You're all set" : `You're paired with ${partnerName}`}
      </Text>
      <Text style={styles.intro}>
        {complete
          ? "Everything's in place. You can change any of it later from the menu."
          : settled
            ? "Whatever you skipped is waiting under the bell on your home screen. Nothing is lost."
            : "A few things and the app starts earning its keep. Skip anything you like. The bell on your home screen keeps whatever is left."}
      </Text>

      <View style={styles.track}>
        {steps.map((step) => {
          const isActive = step.key === active?.key;

          return (
            <View
              key={step.key}
              style={[
                styles.step,
                isActive ? styles.stepActive : null,
                step.done ? styles.stepDone : null,
              ]}
            >
              <View style={styles.stepHead}>
                <View style={[styles.bullet, step.done ? styles.bulletDone : null]}>
                  {step.done ? (
                    <CheckSquareIcon size={14} color={t.textOnBrand} />
                  ) : (
                    <View style={styles.bulletDot} />
                  )}
                </View>
                <Text style={[styles.stepTitle, step.done ? styles.stepTitleDone : null]}>
                  {step.title}
                </Text>
              </View>

              {isActive ? <Text style={styles.stepBlurb}>{step.blurb}</Text> : null}

              {/* Only the step you are on offers its controls. All five at
                  once is a form, and a form is the thing this exists to
                  avoid. */}
              {isActive ? (
                <View style={styles.stepActions}>
                  {step.key === "photo" || step.key === "cover" ? (
                    <PhotoStep
                      kind={step.key === "photo" ? "avatar" : "cover"}
                      url={step.key === "photo" ? myAvatarUrl : coverUrl}
                      name={profile?.display_name ?? null}
                      busy={busy}
                      onPick={() => addPhoto(step.key === "photo" ? "avatar" : "cover")}
                      styles={styles}
                    />
                  ) : step.key === "hours" && hoursOpen ? (
                    <RegularHours
                      styles={styles}
                      onCancel={() => setHoursOpen(false)}
                      onSaved={async () => {
                        setHoursOpen(false);
                        await load();
                      }}
                    />
                  ) : (
                    <View style={styles.buttonRow}>
                      <Pressable
                        style={press(styles.primary)}
                        onPress={() => {
                          tapped();
                          if (step.key === "hours") setHoursOpen(true);
                          else if (step.route) router.push(step.route);
                          else dismiss(step.key);
                        }}
                      >
                        <Text style={styles.primaryText}>
                          {step.key === "hours"
                            ? "I work regular hours"
                            : step.key === "personalisation"
                              ? "Have a look"
                              : "Let's go"}
                        </Text>
                      </Pressable>

                      {step.key === "hours" ? (
                        <Pressable
                          style={press(styles.secondary)}
                          onPress={() => router.push("/work-hours")}
                        >
                          <Text style={styles.secondaryText}>Shifts or a roster</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  )}

                  <View style={styles.skipRow}>
                    {/* Skip stores nothing, so the step stays under the bell.
                        "Not for me" is the one that stops asking. */}
                    <Pressable onPress={() => skipTo(step.key)} hitSlop={8}>
                      <Text style={styles.skip}>Skip for now</Text>
                    </Pressable>
                    {step.key === "hours" || step.key === "personalisation" ? (
                      <Pressable onPress={() => dismiss(step.key)} hitSlop={8}>
                        <Text style={styles.skip}>Not for me</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <Pressable style={press(styles.finish)} onPress={leave}>
        <Text style={[styles.finishText, settled ? styles.finishTextReady : null]}>
          {settled ? "Take me in" : "I'll do the rest later"}
        </Text>
        <ChevronRightIcon size={18} color={settled ? t.brand : t.textMuted} />
      </Pressable>
    </ScrollView>
  );

  /**
   * Move past a step without recording anything.
   *
   * There is nothing to write, so this only has to stop the walkthrough
   * showing the same step again -- which it would, since position is derived
   * from what is done and skipping does not change that.
   */
  function skipTo(key: string) {
    tapped();
    setSkipped((s) => [...s, key]);
  }
}

function PhotoStep({
  kind,
  url,
  name,
  busy,
  onPick,
  styles,
}: {
  kind: "avatar" | "cover";
  url: string | null;
  name: string | null;
  busy: boolean;
  onPick: () => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <View style={styles.photoRow}>
      {kind === "avatar" ? (
        <Avatar url={url} name={name} size={56} />
      ) : (
        <View style={styles.coverPreview}>
          {url ? <Avatar url={url} name={null} size={56} /> : null}
        </View>
      )}

      <Pressable style={press(styles.primary)} onPress={onPick} disabled={busy}>
        <Text style={styles.primaryText}>
          {busy ? "Uploading…" : url ? "Choose a different one" : "Choose a photo"}
        </Text>
      </Pressable>
    </View>
  );
}

/** The nine-to-five answer, so the roster builder is not the only way in. */
function RegularHours({
  styles,
  onCancel,
  onSaved,
}: {
  styles: ReturnType<typeof createStyles>;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const { session, profile } = useAuth();
  const [days, setDays] = useState<number[]>(WEEKDAYS_DEFAULT);
  const [start, setStart] = useState("09:00");
  const [end, setEnd] = useState("17:00");
  const [saving, setSaving] = useState(false);

  function toggle(day: number) {
    tapped();
    setDays((d) => (d.includes(day) ? d.filter((x) => x !== day) : [...d, day]));
  }

  async function save() {
    if (!session?.user.id || !profile?.couple_id || saving) return;

    if (days.length === 0) {
      warned();
      Alert.alert("Pick your days", "Which days do you work?");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("work_patterns").upsert(
      {
        couple_id: profile.couple_id,
        user_id: session.user.id,
        mode: "weekly",
        cycle_weeks: 1,
        anchor_date: new Date().toISOString().slice(0, 10),
        shifts: weeklyShifts(days, start, end),
        updated_at: new Date().toISOString(),
        // The zone the hours were ENTERED in. A 9am start means nine o'clock
        // at work, not nine o'clock wherever the phone later ends up.
        time_zone: deviceTimeZone(),
      },
      { onConflict: "user_id" }
    );
    setSaving(false);

    if (error) {
      warned();
      Alert.alert("Couldn't save", error.message);
      return;
    }

    succeeded();
    onSaved();
  }

  return (
    <View style={styles.hours}>
      <Text style={styles.fieldLabel}>Which days</Text>
      <View style={styles.dayRow}>
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const on = days.includes(day);
          return (
            <Pressable
              key={day}
              onPress={() => toggle(day)}
              style={press([styles.day, on ? styles.dayOn : null])}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.dayText, on ? styles.dayTextOn : null]}>
                {weekdayLabel(day).slice(0, 1)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.fieldLabel}>Hours</Text>
      <View style={styles.timeRow}>
        <TimePick value={start} onChange={setStart} styles={styles} />
        <Text style={styles.timeTo}>to</Text>
        <TimePick value={end} onChange={setEnd} styles={styles} />
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={press(styles.primary)} onPress={save} disabled={saving}>
          <Text style={styles.primaryText}>{saving ? "Saving…" : "Save my hours"}</Text>
        </Pressable>
        <Pressable style={press(styles.secondary)} onPress={onCancel}>
          <Text style={styles.secondaryText}>Back</Text>
        </Pressable>
      </View>
    </View>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

function TimePick({
  value,
  onChange,
  styles,
}: {
  value: string;
  onChange: (v: string) => void;
  styles: ReturnType<typeof createStyles>;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.timeScroll}>
      {HOURS.map((h) => {
        const on = h === value;
        return (
          <Pressable
            key={h}
            onPress={() => {
              tapped();
              onChange(h);
            }}
            style={press([styles.time, on ? styles.timeOn : null])}
          >
            <Text style={[styles.timeText, on ? styles.timeTextOn : null]}>{h}</Text>
          </Pressable>
        );
      })}
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
    eyebrow: { ...t.type.eyebrow, color: t.brand },
    title: { ...t.type.display, color: t.textPrimary, marginTop: t.space(2) },
    intro: { ...t.type.body, color: t.textSecondary, marginTop: t.space(2) },

    track: { marginTop: t.space(7), gap: t.space(3) },
    step: {
      borderRadius: t.radius.lg,
      padding: t.space(4),
      backgroundColor: t.surfaceSunken,
    },
    stepActive: { ...t.card, padding: t.space(5) },
    stepDone: { backgroundColor: "transparent", paddingVertical: t.space(2) },
    stepHead: { flexDirection: "row", alignItems: "center", gap: t.space(3) },
    bullet: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 1.5,
      borderColor: t.textMuted,
      alignItems: "center",
      justifyContent: "center",
    },
    bulletDone: { backgroundColor: t.accent, borderColor: t.accent },
    bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.textMuted },
    stepTitle: { ...t.type.title, color: t.textPrimary, flexShrink: 1 },
    stepTitleDone: { ...t.type.heading, color: t.textMuted },
    stepBlurb: { ...t.type.body, color: t.textSecondary, marginTop: t.space(3) },
    stepActions: { marginTop: t.space(4), gap: t.space(3) },

    buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: t.space(3), alignItems: "center" },
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
    skipRow: { flexDirection: "row", gap: t.space(5), marginTop: t.space(1) },
    skip: { ...t.type.label, color: t.textMuted },

    photoRow: { flexDirection: "row", alignItems: "center", gap: t.space(4) },
    coverPreview: {
      width: 84,
      height: 56,
      borderRadius: t.radius.md,
      backgroundColor: t.surfaceSunken,
      overflow: "hidden",
      alignItems: "center",
      justifyContent: "center",
    },

    hours: { gap: t.space(2) },
    fieldLabel: { ...t.type.eyebrow, color: t.textMuted, marginTop: t.space(2) },
    dayRow: { flexDirection: "row", gap: t.space(2) },
    day: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: t.surfaceSunken,
      alignItems: "center",
      justifyContent: "center",
    },
    dayOn: { backgroundColor: t.accent },
    dayText: { ...t.type.label, color: t.textSecondary },
    dayTextOn: { color: t.textOnBrand },
    timeRow: { flexDirection: "row", alignItems: "center", gap: t.space(2) },
    timeTo: { ...t.type.caption, color: t.textMuted },
    timeScroll: { flex: 1 },
    time: {
      paddingHorizontal: t.space(3),
      paddingVertical: t.space(2),
      borderRadius: t.radius.pill,
      backgroundColor: t.surfaceSunken,
      marginRight: t.space(2),
    },
    timeOn: { backgroundColor: t.accentSoft },
    timeText: { ...t.type.label, color: t.textSecondary, fontVariant: ["tabular-nums"] },
    timeTextOn: { color: t.accent },

    finish: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: t.space(2),
      marginTop: t.space(8),
      paddingVertical: t.space(4),
      borderRadius: t.radius.pill,
    },
    finishText: { ...t.type.label, color: t.textMuted },
    finishTextReady: { color: t.brand },
  });
