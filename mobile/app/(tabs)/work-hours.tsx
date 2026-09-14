import { useCallback, useState } from "react";
import { deviceTimeZone } from "@/lib/timezone";
import { RefreshControl,
  View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from "react-native";
import { press } from "@/components/press";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { DateField, TimeField } from "@/components/fields";
import { toFriendlyDate, toDisplayTime, fromISODate, isValidTimeString } from "@/lib/dates";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import {
  WorkMode,
  WorkPattern,
  WorkShift,
  PatternShift,
  weekdayLabel,
  toDateKey,
} from "@/lib/workHours";


const MODES: { key: WorkMode; label: string; blurb: string }[] = [
  { key: "weekly", label: "Regular hours", blurb: "The same shifts every week." },
  { key: "rotating", label: "Rotating roster", blurb: "A cycle that repeats every few weeks." },
  { key: "irregular", label: "Shift work", blurb: "No pattern, each shift added as it comes." },
];

export default function WorkHours() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile } = useAuth();
  const [mode, setMode] = useState<WorkMode>("weekly");
  const [cycleWeeks, setCycleWeeks] = useState(2);
  const [anchorDate, setAnchorDate] = useState(toDateKey(new Date()));
  const [shifts, setShifts] = useState<PatternShift[]>([]);
  const [oneOffs, setOneOffs] = useState<WorkShift[]>([]);
  const [saving, setSaving] = useState(false);

  // New-shift draft
  const [draftWeek, setDraftWeek] = useState(0);
  const [draftDay, setDraftDay] = useState(1);
  const [draftStart, setDraftStart] = useState("09:00");
  const [draftEnd, setDraftEnd] = useState("17:00");

  // New one-off draft
  const [offDate, setOffDate] = useState("");
  const [offStart, setOffStart] = useState("09:00");
  const [offEnd, setOffEnd] = useState("17:00");

  const userId = session?.user.id ?? null;

  const load = useCallback(async () => {
    if (!userId) return;

    const { data: pattern } = await supabase
      .from("work_patterns")
      .select("id, user_id, mode, cycle_weeks, anchor_date, shifts, time_zone")
      .eq("user_id", userId)
      .maybeSingle();

    if (pattern) {
      const p = pattern as WorkPattern;
      setMode(p.mode);
      setCycleWeeks(p.cycle_weeks);
      setAnchorDate(p.anchor_date);
      setShifts(Array.isArray(p.shifts) ? p.shifts : []);
    }

    const { data: shiftRows } = await supabase
      .from("work_shifts")
      .select("id, user_id, date, start_time, end_time, kind, time_zone")
      .eq("user_id", userId)
      .gte("date", toDateKey(new Date()))
      .order("date", { ascending: true });

    setOneOffs((shiftRows as WorkShift[]) ?? []);
  }, [userId]);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function persist(next: {
    mode?: WorkMode;
    cycleWeeks?: number;
    anchorDate?: string;
    shifts?: PatternShift[];
  }) {
    if (!userId || !profile?.couple_id) return;

    const nextMode = next.mode ?? mode;

    const payload = {
      couple_id: profile.couple_id,
      user_id: userId,
      mode: nextMode,
      // Only a rotating pattern has a cycle. The picker defaults to 2 so that
      // choosing "rotating" starts somewhere sensible, but writing that on a
      // weekly pattern makes every shift land on alternate weeks.
      cycle_weeks: nextMode === "rotating" ? (next.cycleWeeks ?? cycleWeeks) : 1,
      anchor_date: next.anchorDate ?? anchorDate,
      shifts: next.shifts ?? shifts,
      updated_at: new Date().toISOString(),
      // Stamped with where you are when you enter it. A 9am start means nine
      // o'clock at work, and without this it becomes nine o'clock wherever the
      // phone happens to be -- so flying Sydney to Perth would move every
      // shift three hours and offer your partner time you are at work.
      time_zone: deviceTimeZone(),
    };

    setSaving(true);
    const { error } = await supabase
      .from("work_patterns")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);

    if (error) Alert.alert("Couldn't save", error.message);
  }

  function addShift() {
    if (!isValidTimeString(draftStart) || !isValidTimeString(draftEnd)) {
      Alert.alert("Check the times", "Pick a start and an end time.");
      return;
    }

    const next = [
      ...shifts,
      {
        week: mode === "rotating" ? draftWeek : 0,
        weekday: draftDay,
        start: draftStart,
        end: draftEnd,
      },
    ];
    setShifts(next);
    persist({ shifts: next });
  }

  function removeShift(index: number) {
    const next = shifts.filter((_, i) => i !== index);
    setShifts(next);
    persist({ shifts: next });
  }

  async function addOneOff(kind: "extra" | "off") {
    if (!fromISODate(offDate)) {
      Alert.alert("Check the date", "Pick which day this is for.");
      return;
    }
    if (kind === "extra" && (!isValidTimeString(offStart) || !isValidTimeString(offEnd))) {
      Alert.alert("Check the times", "Pick a start and an end time.");
      return;
    }
    if (!userId || !profile?.couple_id) return;

    const { error } = await supabase.from("work_shifts").insert({
      couple_id: profile.couple_id,
      user_id: userId,
      date: offDate,
      kind,
      start_time: kind === "extra" ? `${offStart}:00` : null,
      end_time: kind === "extra" ? `${offEnd}:00` : null,
      time_zone: deviceTimeZone(),
    });

    if (error) {
      Alert.alert("Couldn't save", error.message);
      return;
    }

    setOffDate("");
    load();
  }

  async function removeOneOff(id: string) {
    setOneOffs((prev) => prev.filter((o) => o.id !== id));
    const { error } = await supabase.from("work_shifts").delete().eq("id", id);
    if (error) Alert.alert("Couldn't remove that", error.message);
    load();
  }

  const showsPattern = mode !== "irregular";
  const weekOptions = Array.from({ length: cycleWeeks }, (_, i) => i);

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Your working hours</Text>
      <Text style={styles.subtitle}>
        Work counts as busy, so &quot;free together&quot; stops suggesting times you&apos;re on
        shift. {profile?.display_name ? "Your partner" : "They"} sees when you&apos;re working,
        never what you&apos;re doing.
      </Text>

      <Pressable style={press(styles.importCard)} onPress={() => router.push("/roster-import")}>
        <View style={{ flex: 1 }}>
          <Text style={styles.importTitle}>Paste a roster instead</Text>
          <Text style={styles.importBody}>
            Paste it from an email or a message and we&apos;ll read the shifts out. You check them
            before anything saves.
          </Text>
        </View>
        <Text style={styles.importChevron}>›</Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How do your hours work?</Text>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            style={press([styles.modeRow, mode === m.key ? styles.modeRowActive : null])}
            onPress={() => {
              setMode(m.key);
              persist({ mode: m.key });
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.modeLabel, mode === m.key ? styles.modeLabelActive : null]}>
                {m.label}
              </Text>
              <Text style={styles.modeBlurb}>{m.blurb}</Text>
            </View>
            {mode === m.key ? <Text style={styles.tick}>✓</Text> : null}
          </Pressable>
        ))}
      </View>

      {mode === "rotating" ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Rotation</Text>
          <Text style={styles.fieldLabel}>How many weeks before it repeats?</Text>
          <View style={styles.chipRow}>
            {[2, 3, 4, 5, 6].map((n) => (
              <Pressable
                key={n}
                style={press([styles.chip, cycleWeeks === n ? styles.chipActive : null])}
                onPress={() => {
                  setCycleWeeks(n);
                  persist({ cycleWeeks: n });
                }}
              >
                <Text style={[styles.chipText, cycleWeeks === n ? styles.chipTextActive : null]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.fieldLabel, { marginTop: 14 }]}>
            A date in week 1 of the rotation
          </Text>
          <DateField
            value={anchorDate || null}
            placeholder="Pick a date in week 1"
            onChange={(iso) => {
              setAnchorDate(iso);
              persist({ anchorDate: iso });
            }}
          />
        </View>
      ) : null}

      {showsPattern ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shifts</Text>

          {shifts.length === 0 ? (
            <Text style={styles.empty}>None yet. Add your first below.</Text>
          ) : (
            shifts.map((s, i) => (
              <Pressable key={i} style={press(styles.shiftRow)} onLongPress={() => removeShift(i)}>
                <Text style={styles.shiftDay}>
                  {mode === "rotating" ? `Wk ${s.week + 1} · ` : ""}
                  {weekdayLabel(s.weekday)}
                </Text>
                <Text style={styles.shiftTime}>
                  {toDisplayTime(s.start)} – {toDisplayTime(s.end)}
                  {s.end <= s.start ? " (+1)" : ""}
                </Text>
              </Pressable>
            ))
          )}

          {shifts.length > 0 ? (
            <Text style={styles.hint}>Long-press a shift to remove it.</Text>
          ) : null}

          <View style={styles.divider} />

          {mode === "rotating" ? (
            <>
              <Text style={styles.fieldLabel}>Week</Text>
              <View style={styles.chipRow}>
                {weekOptions.map((w) => (
                  <Pressable
                    key={w}
                    style={press([styles.chip, draftWeek === w ? styles.chipActive : null])}
                    onPress={() => setDraftWeek(w)}
                  >
                    <Text style={[styles.chipText, draftWeek === w ? styles.chipTextActive : null]}>
                      {w + 1}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Day</Text>
          <View style={styles.chipRow}>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => (
              <Pressable
                key={d}
                style={press([styles.chip, draftDay === d ? styles.chipActive : null])}
                onPress={() => setDraftDay(d)}
              >
                <Text style={[styles.chipText, draftDay === d ? styles.chipTextActive : null]}>
                  {weekdayLabel(d)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.row, { marginTop: 12 }]}>
            <TimeField label="Starts" value={draftStart} onChange={setDraftStart} />
            <TimeField label="Ends" value={draftEnd} onChange={setDraftEnd} />
          </View>
          <Pressable style={press([styles.saveButton, { marginTop: 12 }])} onPress={addShift}>
            <Text style={styles.saveButtonText}>Add shift</Text>
          </Pressable>
          <Text style={styles.hint}>
            Finishing earlier than you start means an overnight shift.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          {showsPattern ? "One-off changes" : "Shifts"}
        </Text>
        <Text style={styles.hint}>
          {showsPattern
            ? "A shift the pattern doesn't cover, or a day off it wrongly thinks you're working."
            : "Add each shift against its date."}
        </Text>

        {oneOffs.map((o) => (
          <Pressable key={o.id} style={press(styles.shiftRow)} onLongPress={() => removeOneOff(o.id)}>
            <Text style={styles.shiftDay}>{toFriendlyDate(o.date, false)}</Text>
            <Text style={styles.shiftTime}>
              {o.kind === "off"
                ? "Day off"
                : `${toDisplayTime(o.start_time?.slice(0, 5))} – ${toDisplayTime(o.end_time?.slice(0, 5))}`}
            </Text>
          </Pressable>
        ))}

        <View style={{ marginTop: 12 }}>
          <DateField label="Which day" value={offDate || null} onChange={setOffDate} />
        </View>
        <View style={[styles.row, { marginTop: 10 }]}>
          <TimeField label="Starts" value={offStart} onChange={setOffStart} />
          <TimeField label="Ends" value={offEnd} onChange={setOffEnd} />
        </View>

        <View style={[styles.row, { marginTop: 10 }]}>
          <Pressable style={press([styles.saveButton, { flex: 1 }])} onPress={() => addOneOff("extra")}>
            <Text style={styles.saveButtonText}>+ Add shift</Text>
          </Pressable>
          {showsPattern ? (
            <Pressable style={press([styles.offButton, { flex: 1 }])} onPress={() => addOneOff("off")}>
              <Text style={styles.offButtonText}>Mark day off</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.savingNote}>{saving ? "Saving…" : "Changes save as you make them."}</Text>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 70, paddingBottom: 48 },
  back: { fontSize: 15, color: t.accent, fontWeight: "600", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "600", color: t.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 13, color: t.textSecondary, lineHeight: 19, marginBottom: 20 },
  card: { backgroundColor: t.surface, borderRadius: t.radius.lg, padding: 18, marginBottom: 16 },
  importCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: t.space(3),
    backgroundColor: t.accentSoft,
    borderRadius: t.radius.lg,
    padding: 18,
    marginBottom: 16,
  },
  importTitle: { fontSize: 15, fontWeight: "700", color: t.accent, marginBottom: 4 },
  importBody: { fontSize: 13, color: t.textSecondary, lineHeight: 18 },
  importChevron: { fontSize: 24, color: t.accent },
  cardTitle: { fontSize: 15, fontWeight: "600", color: t.textPrimary, marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: t.textSecondary, marginBottom: 8 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: t.radius.md,
    marginBottom: 8,
    backgroundColor: t.bg,
  },
  modeRowActive: { backgroundColor: t.accentSoft },
  modeLabel: { fontSize: 14, fontWeight: "600", color: t.textPrimary },
  modeLabelActive: { color: t.accent },
  modeBlurb: { fontSize: 12, color: t.textSecondary, marginTop: 2 },
  tick: { color: t.accent, fontSize: 16, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: t.radius.pill,
    backgroundColor: t.bg,
  },
  chipActive: { backgroundColor: t.brand },
  chipText: { fontSize: 13, color: t.textSecondary, fontWeight: "600" },
  chipTextActive: { color: t.surface },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: t.bg,
    borderRadius: t.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: t.accent,
    borderRadius: t.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: { color: t.surface, fontWeight: "600", fontSize: 13 },
  offButton: {
    backgroundColor: t.bg,
    borderRadius: t.radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  offButtonText: { color: t.textSecondary, fontWeight: "600", fontSize: 13 },
  shiftRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.surfaceSunken,
  },
  shiftDay: { fontSize: 14, color: t.textPrimary, fontWeight: "500" },
  shiftTime: { fontSize: 13, color: t.textSecondary },
  empty: { fontSize: 13, color: t.textMuted },
  hint: { fontSize: 12, color: t.textMuted, marginTop: 8, lineHeight: 16 },
  divider: { height: 1, backgroundColor: t.surfaceSunken, marginVertical: 16 },
  savingNote: { fontSize: 12, color: t.textMuted, textAlign: "center" },
  });
