import { useState } from "react";
import { deviceTimeZone } from "@/lib/timezone";
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
        "No shifts found. Each line needs a day and its hours, like \"Mon 8:30am - 5:30pm\"."
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
        // A pasted roster is in the hours of the place that sent it, which is
        // where you are when you paste it.
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
              Paste your roster below, from an email, a message, wherever it arrives. You&apos;ll
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
                ? `, ${warningCount} worth a look. Anything it had to guess at is marked.`
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
                    {w}, check this one
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
    title: { ...t.type.display, color: t.textPrimary },
    close: {
      width: 40,
      height: 40,
      borderRadius: t.radius.pill,
      backgroundColor: t.surface,
      alignItems: "center",
      justifyContent: "center",
    },
    intro: { ...t.type.body, color: t.textSecondary, lineHeight: 20, marginBottom: t.space(5) },
    paste: {
      ...t.card,
      padding: t.space(4),
      minHeight: 200,
      ...t.type.body,
      color: t.textPrimary,
      lineHeight: 21
    },
    primary: {
      backgroundColor: t.accent,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(4),
      alignItems: "center",
      marginTop: t.space(5),
    },
    primaryDisabled: { opacity: 0.5 },
    primaryText: { color: t.textOnBrand, ...t.type.heading },
    secondary: { paddingVertical: t.space(4), alignItems: "center" },
    secondaryText: { color: t.textSecondary, ...t.type.heading },
    hint: { ...t.type.caption, color: t.textMuted, lineHeight: 18, marginTop: t.space(4) },
    row: {
      ...t.card,
      padding: t.space(4),
      marginBottom: t.space(3)
    },
    rowFlagged: { borderWidth: 1.5, borderColor: t.brand },
    rowHead: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: t.space(3),
    },
    rowDay: { ...t.type.heading, color: t.textPrimary },
    remove: { ...t.type.caption, color: t.textMuted },
    times: { flexDirection: "row", gap: t.space(2) },
    offText: { ...t.type.body, color: t.textSecondary, fontStyle: "italic" },
    warning: { ...t.type.caption, color: t.brand, marginTop: t.space(2), fontWeight: "500" },
    source: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
    unparsedCard: {
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.lg,
      padding: t.space(4),
      marginBottom: t.space(3),
    },
    unparsedTitle: { ...t.type.heading, color: t.textPrimary, marginBottom: t.space(2) },
    unparsedLine: { ...t.type.caption, color: t.textSecondary, marginBottom: 2 },
    unparsedHint: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
  });
