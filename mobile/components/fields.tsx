import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Modal } from "react-native";
import { press } from "@/components/press";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import {
  toISODate,
  fromISODate,
  toFriendlyDate,
  toTimeString,
  fromTimeString,
  toDisplayTime,
} from "@/lib/dates";
import { CalendarIcon, ClockIcon } from "@/components/icons";

/**
 * Tappable date and time fields backed by the native picker.
 *
 * Everything was typed as YYYY-MM-DD text before, which is both the slowest
 * way to enter a date and the easiest to get wrong. Values still travel as ISO
 * dates and 24-hour times -- only the interaction and the display change.
 *
 * iOS shows the picker in a sheet with an explicit Done, because its spinner
 * has no inherent confirm step; Android's dialog closes itself.
 */

type DateFieldProps = {
  label?: string;
  value: string | null; // ISO YYYY-MM-DD
  onChange: (iso: string) => void;
  placeholder?: string;
  minimumDate?: Date;
  maximumDate?: Date;
};

/**
 * The picker on its own, with no opinion about what opens it.
 *
 * DateField below is the usual way in -- a labelled row you tap. The to-do
 * bar wants the same picker behind a chip the width of the word "Due", and a
 * second copy of the iOS sheet, the Android dialog and the theme handling is
 * how those two quietly stop behaving the same way.
 */
export function DatePickerSheet({
  value,
  onPick,
  onClear,
  onClose,
  title = "Pick a date",
  minimumDate,
  maximumDate,
}: {
  value: string | null;
  onPick: (iso: string) => void;
  /** When given, a way out of having a date at all. */
  onClear?: () => void;
  onClose: () => void;
  title?: string;
  minimumDate?: Date;
  maximumDate?: Date;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  // Rendered only while it is open, so the draft starts from the current
  // value every time it appears and there is no effect keeping two copies of
  // the same date in step.
  //
  // Clamped, because on iOS the wheel is only a display: Done sends the
  // DRAFT, and a draft that was never spun is whatever it started as. An
  // empty From field on a trip that already has a To would otherwise start
  // at today, and one tap of Done would send a range the database refuses --
  // with the name of a check constraint as the explanation.
  const [draft, setDraft] = useState<Date>(() => {
    const seed = fromISODate(value ?? "") ?? new Date();
    if (maximumDate && seed > maximumDate) return maximumDate;
    if (minimumDate && seed < minimumDate) return minimumDate;
    return seed;
  });

  const picker = (
    <DateTimePicker
      value={draft}
      mode="date"
      display={Platform.OS === "ios" ? "spinner" : "default"}
      // The native picker follows the PHONE's appearance unless told
      // otherwise, while this sheet follows the app's theme -- which renders
      // white text on a white sheet and makes the picker look missing.
      themeVariant={t.scheme}
      textColor={t.textPrimary}
      accentColor={t.accent}
      style={Platform.OS === "ios" ? styles.picker : undefined}
      minimumDate={minimumDate}
      maximumDate={maximumDate}
      onChange={(event, selected) => {
        if (Platform.OS === "android") {
          onClose();
          if (event.type === "set" && selected) onPick(toISODate(selected));
          return;
        }
        if (selected) setDraft(selected);
      }}
    />
  );

  if (Platform.OS === "android") return picker;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={press(styles.backdrop)} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetBar}>
          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.sheetCancel}>Cancel</Text>
          </Pressable>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable
            onPress={() => {
              onPick(toISODate(draft));
              onClose();
            }}
            hitSlop={8}
          >
            <Text style={styles.sheetDone}>Done</Text>
          </Pressable>
        </View>
        {picker}

        {/* A picker can only ever say "this date". Somewhere that a date is
            optional needs a way back to none, and the alternative was
            setting it to today and unsetting that. */}
        {onClear && value ? (
          <Pressable
            style={press(styles.clear)}
            onPress={() => {
              onClear();
              onClose();
            }}
          >
            <Text style={styles.clearText}>Clear the date</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

export function DateField({
  label,
  value,
  onChange,
  placeholder = "Pick a date",
  minimumDate,
  maximumDate,
}: DateFieldProps) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const [open, setOpen] = useState(false);

  const display = value ? toFriendlyDate(value) : "";

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.field, pressed ? styles.fieldPressed : null]}
        onPress={() => setOpen(true)}
      >
        <CalendarIcon size={18} color={t.textMuted} />
        <Text style={[styles.value, !display ? styles.placeholder : null]}>
          {display || placeholder}
        </Text>
      </Pressable>

      {open ? (
        <DatePickerSheet
          value={value}
          onPick={onChange}
          onClose={() => setOpen(false)}
          title={label ?? "Pick a date"}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
        />
      ) : null}
    </View>
  );
}

type TimeFieldProps = {
  label?: string;
  value: string; // "HH:MM" or "HH:MM:SS"
  onChange: (time: string) => void;
};

export function TimeField({ label, value, onChange }: TimeFieldProps) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(() => fromTimeString(value));

  function openPicker() {
    setDraft(fromTimeString(value));
    setOpen(true);
  }

  const picker = (
    <DateTimePicker
      value={draft}
      mode="time"
      is24Hour={false}
      minuteInterval={5}
      display={Platform.OS === "ios" ? "spinner" : "default"}
      themeVariant={t.scheme}
      textColor={t.textPrimary}
      accentColor={t.accent}
      style={Platform.OS === "ios" ? styles.picker : undefined}
      onChange={(event, selected) => {
        if (Platform.OS === "android") {
          setOpen(false);
          if (event.type === "set" && selected) onChange(toTimeString(selected));
          return;
        }
        if (selected) setDraft(selected);
      }}
    />
  );

  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        style={({ pressed }) => [styles.field, pressed ? styles.fieldPressed : null]}
        onPress={openPicker}
      >
        <ClockIcon size={18} color={t.textMuted} />
        <Text style={styles.value}>{toDisplayTime(value) || "Pick a time"}</Text>
      </Pressable>

      {open && Platform.OS === "android" ? picker : null}

      {Platform.OS === "ios" ? (
        <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)}>
          <Pressable style={press(styles.backdrop)} onPress={() => setOpen(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetBar}>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={styles.sheetCancel}>Cancel</Text>
              </Pressable>
              <Text style={styles.sheetTitle}>{label ?? "Pick a time"}</Text>
              <Pressable
                onPress={() => {
                  onChange(toTimeString(draft));
                  setOpen(false);
                }}
                hitSlop={8}
              >
                <Text style={styles.sheetDone}>Done</Text>
              </Pressable>
            </View>
            {picker}
          </View>
        </Modal>
      ) : null}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    wrap: { flex: 1 },
    label: { fontSize: 12, color: t.textSecondary, marginBottom: t.space(1.5) },
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(2),
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space(3.5),
      paddingVertical: t.space(3.5),
    },
    fieldPressed: { backgroundColor: t.accentSoft },
    value: { fontSize: 14, color: t.textPrimary, flexShrink: 1 },
    placeholder: { color: t.textMuted },
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: t.radius.xl,
      borderTopRightRadius: t.radius.xl,
      paddingBottom: t.space(8),
    },
    sheetBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: t.space(5),
      paddingVertical: t.space(4),
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: t.border,
    },
    // iOS spinners need a definite height inside a modal, or they lay out
    // against an unbounded parent and drift off the bottom.
    picker: { height: 216, backgroundColor: t.surface },
    sheetTitle: { fontSize: 15, fontWeight: "600", color: t.textPrimary },
    sheetCancel: { fontSize: 15, color: t.textMuted },
    sheetDone: { fontSize: 15, color: t.accent, fontWeight: "700" },
    clear: { alignItems: "center", paddingVertical: 14 },
    clearText: { fontSize: 15, color: t.danger, fontWeight: "600" },
  });
