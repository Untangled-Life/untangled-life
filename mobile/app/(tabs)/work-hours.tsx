import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from "react-native";
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

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const MODES: { key: WorkMode; label: string; blurb: string }[] = [
  { key: "weekly", label: "Regular hours", blurb: "The same shifts every week." },
  { key: "rotating", label: "Rotating roster", blurb: "A cycle that repeats every few weeks." },
  { key: "irregular", label: "Shift work", blurb: "No pattern — each shift added as it comes." },
];

export default function WorkHours() {
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
      .select("id, user_id, mode, cycle_weeks, anchor_date, shifts")
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
      .select("id, user_id, date, start_time, end_time, kind")
      .eq("user_id", userId)
      .gte("date", toDateKey(new Date()))
      .order("date", { ascending: true });

    setOneOffs((shiftRows as WorkShift[]) ?? []);
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

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
    };

    setSaving(true);
    const { error } = await supabase
      .from("work_patterns")
      .upsert(payload, { onConflict: "user_id" });
    setSaving(false);

    if (error) Alert.alert("Couldn't save", error.message);
  }

  function addShift() {
    if (!TIME_PATTERN.test(draftStart) || !TIME_PATTERN.test(draftEnd)) {
      Alert.alert("Check the times", "Use 24-hour times like 09:00 or 17:30.");
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
    if (!DATE_PATTERN.test(offDate)) {
      Alert.alert("Check the date", "Use YYYY-MM-DD.");
      return;
    }
    if (kind === "extra" && (!TIME_PATTERN.test(offStart) || !TIME_PATTERN.test(offEnd))) {
      Alert.alert("Check the times", "Use 24-hour times like 09:00 or 17:30.");
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
    await supabase.from("work_shifts").delete().eq("id", id);
    load();
  }

  const showsPattern = mode !== "irregular";
  const weekOptions = Array.from({ length: cycleWeeks }, (_, i) => i);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.back}>‹ Back</Text>
      </Pressable>

      <Text style={styles.title}>Your working hours</Text>
      <Text style={styles.subtitle}>
        Work counts as busy, so &quot;free together&quot; stops suggesting times you&apos;re on
        shift. {profile?.display_name ? "Your partner" : "They"} sees when you&apos;re working,
        never what you&apos;re doing.
      </Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>How do your hours work?</Text>
        {MODES.map((m) => (
          <Pressable
            key={m.key}
            style={[styles.modeRow, mode === m.key ? styles.modeRowActive : null]}
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
                style={[styles.chip, cycleWeeks === n ? styles.chipActive : null]}
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
          <View style={styles.row}>
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={anchorDate}
              onChangeText={setAnchorDate}
              keyboardType="numbers-and-punctuation"
            />
            <Pressable style={styles.saveButton} onPress={() => persist({ anchorDate })}>
              <Text style={styles.saveButtonText}>Set</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showsPattern ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Shifts</Text>

          {shifts.length === 0 ? (
            <Text style={styles.empty}>None yet — add your first below.</Text>
          ) : (
            shifts.map((s, i) => (
              <Pressable key={i} style={styles.shiftRow} onLongPress={() => removeShift(i)}>
                <Text style={styles.shiftDay}>
                  {mode === "rotating" ? `Wk ${s.week + 1} · ` : ""}
                  {weekdayLabel(s.weekday)}
                </Text>
                <Text style={styles.shiftTime}>
                  {s.start} – {s.end}
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
                    style={[styles.chip, draftWeek === w ? styles.chipActive : null]}
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
                style={[styles.chip, draftDay === d ? styles.chipActive : null]}
                onPress={() => setDraftDay(d)}
              >
                <Text style={[styles.chipText, draftDay === d ? styles.chipTextActive : null]}>
                  {weekdayLabel(d)}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.row, { marginTop: 12 }]}>
            <TextInput
              style={styles.input}
              placeholder="09:00"
              value={draftStart}
              onChangeText={setDraftStart}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={styles.input}
              placeholder="17:00"
              value={draftEnd}
              onChangeText={setDraftEnd}
              keyboardType="numbers-and-punctuation"
            />
            <Pressable style={styles.saveButton} onPress={addShift}>
              <Text style={styles.saveButtonText}>Add</Text>
            </Pressable>
          </View>
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
          <Pressable key={o.id} style={styles.shiftRow} onLongPress={() => removeOneOff(o.id)}>
            <Text style={styles.shiftDay}>{o.date}</Text>
            <Text style={styles.shiftTime}>
              {o.kind === "off"
                ? "Day off"
                : `${o.start_time?.slice(0, 5)} – ${o.end_time?.slice(0, 5)}`}
            </Text>
          </Pressable>
        ))}

        <View style={[styles.row, { marginTop: 12 }]}>
          <TextInput
            style={[styles.input, { flex: 1.3 }]}
            placeholder="YYYY-MM-DD"
            value={offDate}
            onChangeText={setOffDate}
            keyboardType="numbers-and-punctuation"
          />
          <TextInput
            style={styles.input}
            placeholder="09:00"
            value={offStart}
            onChangeText={setOffStart}
            keyboardType="numbers-and-punctuation"
          />
          <TextInput
            style={styles.input}
            placeholder="17:00"
            value={offEnd}
            onChangeText={setOffEnd}
            keyboardType="numbers-and-punctuation"
          />
        </View>

        <View style={[styles.row, { marginTop: 10 }]}>
          <Pressable style={[styles.saveButton, { flex: 1 }]} onPress={() => addOneOff("extra")}>
            <Text style={styles.saveButtonText}>+ Add shift</Text>
          </Pressable>
          {showsPattern ? (
            <Pressable style={[styles.offButton, { flex: 1 }]} onPress={() => addOneOff("off")}>
              <Text style={styles.offButtonText}>Mark day off</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      <Text style={styles.savingNote}>{saving ? "Saving…" : "Changes save as you make them."}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 70, paddingBottom: 48 },
  back: { fontSize: 15, color: "#1D9E75", fontWeight: "600", marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "600", color: "#14140F", marginBottom: 8 },
  subtitle: { fontSize: 13, color: "#6B6B6B", lineHeight: 19, marginBottom: 20 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#14140F", marginBottom: 12 },
  fieldLabel: { fontSize: 12, color: "#6B6B6B", marginBottom: 8 },
  modeRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
    backgroundColor: "#F7F5F0",
  },
  modeRowActive: { backgroundColor: "#E8F5EF" },
  modeLabel: { fontSize: 14, fontWeight: "600", color: "#14140F" },
  modeLabelActive: { color: "#1D9E75" },
  modeBlurb: { fontSize: 12, color: "#6B6B6B", marginTop: 2 },
  tick: { color: "#1D9E75", fontSize: 16, fontWeight: "700" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#F7F5F0",
  },
  chipActive: { backgroundColor: "#D85A30" },
  chipText: { fontSize: 13, color: "#6B6B6B", fontWeight: "600" },
  chipTextActive: { color: "#fff" },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: "#F7F5F0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#1D9E75",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  saveButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  offButton: {
    backgroundColor: "#F7F5F0",
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  offButtonText: { color: "#6B6B6B", fontWeight: "600", fontSize: 13 },
  shiftRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EEE8",
  },
  shiftDay: { fontSize: 14, color: "#14140F", fontWeight: "500" },
  shiftTime: { fontSize: 13, color: "#6B6B6B" },
  empty: { fontSize: 13, color: "#9A9A9A" },
  hint: { fontSize: 12, color: "#9A9A9A", marginTop: 8, lineHeight: 16 },
  divider: { height: 1, backgroundColor: "#F0EEE8", marginVertical: 16 },
  savingNote: { fontSize: 12, color: "#9A9A9A", textAlign: "center" },
});
