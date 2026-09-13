import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { press } from "@/components/press";
import { succeeded, warned } from "@/lib/haptics";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { parseRoster, toPatternShifts, ParsedShift, countWarnings } from "@/lib/rosterParser";
import { weekdayLabel } from "@/lib/workHours";
import { toDisplayTime, toFriendlyDate } from "@/lib/dates";
import { TimeField } from "@/components/fields";
import { CloseIcon } from "@/components/icons";

const EXAMPLE = `Mon   8:30am - 5:30pm
Tue   8:30am - 5:30pm
Wed   RDO
Thu   8:30am - 5:30pm
Fri   8:30am - 9:00pm
Sat   9am - 4pm
Sun   OFF`;

export default function RosterImport() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const { session, profile } = useAuth();

  const [text, setText] = useState("");
  const [parsed, setParsed] = useState<ParsedShift[] | null>(null);
  const [unparsed, setUnparsed] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function runParse() {
    const result = parseRoster(text);
    if (result.shifts.length === 0) {
      Alert.alert(
        "Couldn't read that",
        "No shifts found. Each line needs a day and its hours — like \"Mon 8:30am - 5:30pm\"."
      );
      return;
    }
    setParsed(result.shifts);
    setUnparsed(result.unparsed);
  }

  function updateShift(index: number, patch: Partial<ParsedShift>) {
    setParsed((prev) =>
      prev ? prev.map((s, i) => (i === index ? { ...s, ...patch, warnings: [] } : s)) : prev
    );
  }

  function removeShift(index: number) {
    setParsed((prev) => (prev ? prev.filter((_, i) => i !== index) : prev));
  }

  async function save() {
    if (!parsed || !session?.user.id || !profile?.couple_id) return;

    const shifts = toPatternShifts(parsed);
    if (shifts.length === 0) {
      Alert.alert("Nothing to save", "Every row is a day off, so there are no hours to store.");
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
        shifts,
        updated_at: new Date().toISOString(),
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

    Alert.alert(
      "Roster saved",
      `${shifts.length} ${shifts.length === 1 ? "shift" : "shifts"} saved as your weekly hours. This replaced anything that was there before.`,
      [{ text: "OK", onPress: () => router.replace("/work-hours") }]
    );
  }

  const warningCount = parsed ? countWarnings(parsed) : 0;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.title}>Import a roster</Text>
          <Pressable onPress={() => router.back()} hitSlop={12} style={press(styles.close)}>
            <CloseIcon size={20} color={t.textSecondary} />
          </Pressable>
        </View>

        {!parsed ? (
          <>
            <Text style={styles.intro}>
              Paste your roster below — from an email, a message, wherever it arrives. You&apos;ll
              see exactly what was understood before anything is saved.
            </Text>

            <TextInput
              style={styles.paste}
              multiline
              textAlignVertical="top"
              placeholder={EXAMPLE}
              placeholderTextColor={t.textMuted}
              value={text}
              onChangeText={setText}
            />

            <Pressable
              style={press([styles.primary, !text.trim() ? styles.primaryDisabled : null])}
              onPress={runParse}
              disabled={!text.trim()}
            >
              <Text style={styles.primaryText}>Read it</Text>
            </Pressable>

            <Text style={styles.hint}>
              Most formats work: 24-hour, am/pm, 0830-1730, and RDO or OFF for a day off. Nothing
              saves until you&apos;ve checked it.
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.intro}>
              {parsed.length} {parsed.length === 1 ? "row" : "rows"} read
              {warningCount > 0
                ? `, ${warningCount} worth a look — anything it had to guess at is marked.`
                : ". Nothing needed guessing."}
            </Text>

            {parsed.map((shift, i) => (
              <View
                key={i}
                style={[styles.row, shift.warnings.length ? styles.rowFlagged : null]}
              >
                <View style={styles.rowHead}>
                  <Text style={styles.rowDay}>
                    {shift.weekday >= 0 ? weekdayLabel(shift.weekday) : "?"}
                    {shift.date ? ` · ${toFriendlyDate(shift.date, false)}` : ""}
                  </Text>
                  <Pressable onPress={() => removeShift(i)} hitSlop={8}>
                    <Text style={styles.remove}>Remove</Text>
                  </Pressable>
                </View>

                {shift.off ? (
                  <Text style={styles.offText}>Day off</Text>
                ) : (
                  <View style={styles.times}>
                    <TimeField
                      value={shift.start}
                      onChange={(v) => updateShift(i, { start: v })}
                    />
                    <TimeField value={shift.end} onChange={(v) => updateShift(i, { end: v })} />
                  </View>
                )}

                {shift.warnings.map((w) => (
                  <Text key={w} style={styles.warning}>
                    {w} — check this one
                  </Text>
                ))}

                <Text style={styles.source}>Read from: {shift.source}</Text>
              </View>
            ))}

            {unparsed.length > 0 ? (
              <View style={styles.unparsedCard}>
                <Text style={styles.unparsedTitle}>
                  Couldn&apos;t read {unparsed.length}{" "}
                  {unparsed.length === 1 ? "line" : "lines"}
                </Text>
                {unparsed.map((line) => (
                  <Text key={line} style={styles.unparsedLine}>
                    {line}
                  </Text>
                ))}
                <Text style={styles.unparsedHint}>
                  Add these by hand on the working hours screen after saving.
                </Text>
              </View>
            ) : null}

            <Pressable
              style={press([styles.primary, saving ? styles.primaryDisabled : null])}
              onPress={save}
              disabled={saving}
            >
              <Text style={styles.primaryText}>
                {saving ? "Saving…" : "Save as my weekly hours"}
              </Text>
            </Pressable>

            <Pressable onPress={() => setParsed(null)} style={press(styles.secondary)}>
              <Text style={styles.secondaryText}>Back to the paste</Text>
            </Pressable>

            <Text style={styles.hint}>
              Saving replaces your current weekly hours. One-off changes you&apos;ve added stay put.
            </Text>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: t.space(6),
      paddingTop: t.space(14),
      paddingBottom: t.space(12),
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: t.space(3),
    },
    title: { fontSize: 26, fontWeight: "700", color: t.textPrimary },
    close: {
      width: 40,
      height: 40,
      borderRadius: t.radius.pill,
      backgroundColor: t.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    intro: { fontSize: 14, color: t.textSecondary, lineHeight: 20, marginBottom: t.space(5) },
    paste: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      padding: t.space(4),
      minHeight: 200,
      fontSize: 14,
      color: t.textPrimary,
      lineHeight: 21,
      ...t.shadow,
    },
    primary: {
      backgroundColor: t.accent,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(4),
      alignItems: "center",
      marginTop: t.space(5),
    },
    primaryDisabled: { opacity: 0.5 },
    primaryText: { color: t.textOnBrand, fontWeight: "700", fontSize: 15 },
    secondary: { paddingVertical: t.space(4), alignItems: "center" },
    secondaryText: { color: t.textSecondary, fontSize: 14, fontWeight: "500" },
    hint: { fontSize: 12, color: t.textMuted, lineHeight: 18, marginTop: t.space(4) },
    row: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      padding: t.space(4),
      marginBottom: t.space(3),
      ...t.shadow,
    },
    rowFlagged: { borderWidth: 1.5, borderColor: t.brand },
    rowHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: t.space(3),
    },
    rowDay: { fontSize: 15, fontWeight: "700", color: t.textPrimary },
    remove: { fontSize: 13, color: t.textMuted },
    times: { flexDirection: "row", gap: t.space(2) },
    offText: { fontSize: 14, color: t.textSecondary, fontStyle: "italic" },
    warning: { fontSize: 12, color: t.brand, marginTop: t.space(2), fontWeight: "500" },
    source: { fontSize: 11, color: t.textMuted, marginTop: t.space(2) },
    unparsedCard: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(4),
      marginBottom: t.space(3),
    },
    unparsedTitle: { fontSize: 14, fontWeight: "600", color: t.textPrimary, marginBottom: t.space(2) },
    unparsedLine: { fontSize: 13, color: t.textSecondary, marginBottom: 2 },
    unparsedHint: { fontSize: 12, color: t.textMuted, marginTop: t.space(2) },
  });
