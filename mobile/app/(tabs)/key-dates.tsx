import { useCallback, useState } from "react";
import { RefreshControl, Alert, Switch,
  View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { press } from "@/components/press";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { DateField } from "@/components/fields";
import { toFriendlyDate, fromISODate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { PhotoTile } from "@/components/photo-tile";
import { removePhoto } from "@/lib/photos";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import {
  KeyDateRow,
  displayTitleFor,
  describeReminders,
  reminderLabel,
  countdownLabel,
  daysLabel,
  daysUntil,
  nextReminderDays,
  tripNights,
  REMINDER_CHOICES,
  DEFAULT_REMINDER_DAYS,
} from "@/lib/keyDates";
import { requestNotificationPermission, rescheduleKeyDateReminders } from "@/lib/notifications";
import { succeeded, warned, tapped } from "@/lib/haptics";


/**
 * The countdown, the reminder switch, and when the next nudge lands.
 *
 * Shown on the card itself rather than behind the "Reminders & notes" panel.
 * "Anniversary in 341 days" is the thing you opened this screen to see, and
 * "first reminder in 327 days" is the answer to the question that follows it --
 * neither is worth a tap to reach.
 */
function ReminderSummary({
  row,
  title,
  onToggle,
}: {
  row: KeyDateRow;
  title: string;
  onToggle: (row: KeyDateRow) => void;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const on = row.reminders_on !== false;
  const days = row.reminder_days ?? DEFAULT_REMINDER_DAYS;
  const until = daysUntil(row.date, row.recurring);
  const next = nextReminderDays(until, days);

  return (
    <View style={styles.summary}>
      <Text style={styles.summaryCountdown}>
        {title} {daysLabel(until)}
      </Text>

      <View style={styles.summaryRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryLabel}>Reminders</Text>
          <Text style={styles.summaryNext}>
            {!on
              ? "Off. Your schedule is kept."
              : days.length === 0
                ? "No reminder days chosen yet"
                : next === null
                  ? "All of this year's have been and gone"
                  : `1st reminder ${daysLabel(next)}`}
          </Text>
        </View>
        <Switch
          value={on}
          onValueChange={() => onToggle(row)}
          trackColor={{ true: t.brand, false: t.surfaceSunken }}
        />
      </View>
    </View>
  );
}

/**
 * Reminders and notes for one key date.
 *
 * Declared at module level rather than inside KeyDates: a component defined in
 * the render body is a new type every render, so React unmounts and remounts
 * it -- and the notes field would lose focus on every keystroke.
 */
function DetailsPanel({
  row,
  coupleId,
  onToggle,
  onSaveNotes,
  onTogglePin,
  onSetEndDate,
  onSetPhoto,
}: {
  row: KeyDateRow;
  coupleId: string | null;
  onToggle: (row: KeyDateRow, offset: number) => void;
  onSaveNotes: (row: KeyDateRow, notes: string) => void;
  onTogglePin: (row: KeyDateRow) => void;
  onSetEndDate: (row: KeyDateRow, endDate: string | null) => void;
  onSetPhoto: (row: KeyDateRow, path: string | null) => Promise<boolean>;
}) {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();
  const selected = row.reminder_days ?? DEFAULT_REMINDER_DAYS;
  const [notes, setNotes] = useState(row.notes ?? "");

  return (
    <View style={styles.details}>
      {/* A face for it. A countdown to "Birthday" is a number; a countdown
          under a photograph of the person is the reason anybody opens this. */}
      <Text style={styles.detailsLabel}>Photo</Text>
      <View style={{ marginBottom: 16 }}>
        <PhotoTile
          path={row.photo_path}
          kind="date"
          ownerId={coupleId}
          onChange={(path) => onSetPhoto(row, path)}
          label="Add a photo for this one"
          height={180}
        />
      </View>

      <Text style={styles.detailsLabel}>
        {row.reminders_on === false ? "Remind me (currently off)" : "Remind me"}
      </Text>
      <View style={styles.chips}>
        {REMINDER_CHOICES.map((offset) => {
          const on = selected.includes(offset);
          return (
            <Pressable
              key={offset}
              style={press([styles.chip, on ? styles.chipOn : null])}
              onPress={() => onToggle(row, offset)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <Text style={[styles.chipText, on ? styles.chipTextOn : null]}>
                {reminderLabel(offset)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.detailsHint}>
        {row.reminders_on === false
          ? `${describeReminders(selected)}, kept for when you switch reminders back on.`
          : `${describeReminders(selected)}. 9am, on your phone only.`}
      </Text>

      {/* Only misc dates can run over days -- an anniversary is one day by
          definition, and the database constraint agrees. */}
      {row.kind === "misc" ? (
        <>
          <Text style={[styles.detailsLabel, { marginTop: 16 }]}>Runs until (optional)</Text>
          <DateField
            value={row.end_date}
            placeholder="Same day"
            minimumDate={fromISODate(row.date) ?? undefined}
            onChange={(iso) => onSetEndDate(row, iso)}
          />
          {row.end_date ? (
            <View style={styles.detailsRow}>
              <Text style={styles.detailsHint}>
                {tripNights(row) === 0
                  ? "A day out."
                  : `${tripNights(row)} night${tripNights(row) === 1 ? "" : "s"} away.`}
              </Text>
              <Pressable onPress={() => onSetEndDate(row, null)} hitSlop={8}>
                <Text style={styles.clear}>Make it one day</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : null}

      <Pressable style={press(styles.pinRow)} onPress={() => onTogglePin(row)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailsLabel}>Pin to Home</Text>
          <Text style={styles.detailsHint}>
            A big countdown at the top, instead of one card in the row.
          </Text>
        </View>
        <Switch
          value={row.pinned}
          onValueChange={() => onTogglePin(row)}
          trackColor={{ true: t.brand, false: t.surfaceSunken }}
        />
      </Pressable>

      <Text style={[styles.detailsLabel, { marginTop: 16 }]}>Notes and gift ideas</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        onBlur={() => onSaveNotes(row, notes)}
        placeholder="She mentioned those earrings..."
        placeholderTextColor={t.textMuted}
        multiline
      />
      <Text style={styles.detailsHint}>Both of you can see this.</Text>
    </View>
  );
}

export default function KeyDates() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { profile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const [dates, setDates] = useState<KeyDateRow[]>([]);
  const [anniversaryInput, setAnniversaryInput] = useState("");
  const [myBirthdayInput, setMyBirthdayInput] = useState("");
  const [partnerBirthdayInput, setPartnerBirthdayInput] = useState("");
  const [miscTitle, setMiscTitle] = useState("");
  const [miscDate, setMiscDate] = useState("");
  const [miscEnd, setMiscEnd] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Which misc date is open for editing, and the draft title while it is.
  // Editing in place beats a modal here: the row is two fields, and you can
  // see the others while you change one.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Which date has its reminders/notes panel open. One at a time -- the panel
  // is tall, and three of them expanded turns the screen into a scroll.
  const [openDetailId, setOpenDetailId] = useState<string | null>(null);

  const partnerName = partner?.display_name ?? "Partner";
  const myId = me.id;
  const partnerId = partner?.id ?? null;

  const nameFor = useCallback(
    (userId: string | null) => {
      if (userId && userId === myId) return me.display_name ?? "You";
      if (userId && userId === partnerId) return partnerName;
      return partnerName;
    },
    [myId, partnerId, me.display_name, partnerName]
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring, kind, subject_user_id, reminder_days, reminders_on, notes, end_date, pinned, photo_path")
      .order("date", { ascending: true });

    if (data) {
      const rows = data as KeyDateRow[];
      setDates(rows);
      setAnniversaryInput(rows.find((d) => d.kind === "anniversary")?.date ?? "");
      setMyBirthdayInput(
        rows.find((d) => d.kind === "birthday" && d.subject_user_id === myId)?.date ?? ""
      );
      setPartnerBirthdayInput(
        rows.find((d) => d.kind === "birthday" && d.subject_user_id === partnerId)?.date ?? ""
      );

      await requestNotificationPermission();
      await rescheduleKeyDateReminders(
        rows.map((d) => ({
          id: d.id,
          displayTitle: displayTitleFor(d, nameFor),
          date: d.date,
          recurring: d.recurring,
          reminderDays: d.reminder_days ?? DEFAULT_REMINDER_DAYS,
          remindersOn: d.reminders_on !== false,
        }))
      );
    }
  }, [myId, partnerId, nameFor]);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function saveSingleton(
    kind: "anniversary" | "birthday",
    date: string,
    title: string,
    subjectUserId: string | null = null
  ) {
    if (!fromISODate(date) || !profile?.couple_id) {
      setError("Pick a date first.");
      return;
    }
    setError(null);

    // A birthday is one per person, so match on the subject too -- otherwise
    // saving your own birthday would overwrite your partner's.
    const existing = dates.find(
      (d) =>
        d.kind === kind &&
        (kind !== "birthday" || d.subject_user_id === subjectUserId)
    );

    const { error: saveError } = existing
      ? await supabase.from("key_dates").update({ date }).eq("id", existing.id)
      : await supabase.from("key_dates").insert({
          couple_id: profile.couple_id,
          created_by: profile.id,
          kind,
          title,
          date,
          recurring: true,
          subject_user_id: subjectUserId,
        });

    if (saveError) {
      setError(saveError.message);
      return;
    }

    load();
  }

  async function addMisc() {
    if (!miscTitle.trim() || !fromISODate(miscDate) || !profile?.couple_id) {
      setError("Give it a name and pick a date.");
      return;
    }
    setError(null);

    // An end date makes it a trip, and a trip is a specific one. "Bali 2026"
    // coming round again in 2027 is not what anyone meant.
    const isTrip = Boolean(miscEnd);

    const { error: addError } = await supabase.from("key_dates").insert({
      couple_id: profile.couple_id,
      created_by: profile.id,
      kind: "misc",
      title: miscTitle.trim(),
      date: miscDate,
      end_date: isTrip ? miscEnd : null,
      recurring: !isTrip,
    });

    if (addError) {
      setError(addError.message);
      return;
    }

    setMiscTitle("");
    setMiscDate("");
    setMiscEnd("");
    load();
  }

  /**
   * Clearing an anniversary or a birthday deletes the row rather than blanking
   * the date, because a key date with no date isn't a thing -- and a stored
   * row with an empty date would still be scheduling reminders.
   */
  async function clearSingleton(
    kind: "anniversary" | "birthday",
    subjectUserId: string | null = null
  ) {
    const existing = dates.find(
      (d) => d.kind === kind && (kind !== "birthday" || d.subject_user_id === subjectUserId)
    );
    if (!existing) return;

    const what =
      kind === "anniversary"
        ? "your anniversary"
        : subjectUserId === myId
          ? "your birthday"
          : `${partnerName}'s birthday`;

    Alert.alert(`Clear ${what}?`, "Its reminders go with it, for both of you.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          setError(null);
          const photo = existing.photo_path;

          const { error: clearError } = await supabase
            .from("key_dates")
            .delete()
            .eq("id", existing.id);

          if (clearError) {
            warned();
            Alert.alert("Couldn't clear that", clearError.message);
            return;
          }

          await removePhoto(photo);

          // The inputs are driven by `dates`, but load() only refills them
          // from rows that exist -- a cleared one leaves the old value sitting
          // in the field, which reads as "the delete didn't work".
          if (kind === "anniversary") setAnniversaryInput("");
          else if (subjectUserId === myId) setMyBirthdayInput("");
          else setPartnerBirthdayInput("");

          succeeded();
          load();
        },
      },
    ]);
  }

  async function toggleRemindersOn(row: KeyDateRow) {
    const next = !(row.reminders_on !== false);
    tapped();
    setDates((prev) =>
      prev.map((d) => (d.id === row.id ? { ...d, reminders_on: next } : d))
    );

    const { error: saveError } = await supabase
      .from("key_dates")
      .update({ reminders_on: next })
      .eq("id", row.id);

    if (saveError) {
      warned();
      Alert.alert("Couldn't change that", saveError.message);
    }
    // load() reschedules every reminder from scratch, which is what makes
    // switching off take effect now rather than at the next app open.
    load();
  }

  async function toggleReminder(row: KeyDateRow, offset: number) {
    const current = row.reminder_days ?? DEFAULT_REMINDER_DAYS;
    const next = current.includes(offset)
      ? current.filter((d) => d !== offset)
      : [...current, offset].sort((a, b) => b - a);

    // Optimistic, so the chip moves under your finger. The reload below is
    // what makes it true.
    setDates((prev) =>
      prev.map((d) => (d.id === row.id ? { ...d, reminder_days: next } : d))
    );
    tapped();

    const { error: saveError } = await supabase
      .from("key_dates")
      .update({ reminder_days: next })
      .eq("id", row.id);

    if (saveError) {
      warned();
      Alert.alert("Couldn't change that", saveError.message);
    }
    load();
  }

  async function saveNotes(row: KeyDateRow, notes: string) {
    const trimmed = notes.trim();
    if (trimmed === (row.notes ?? "")) return;

    const { error: saveError } = await supabase
      .from("key_dates")
      .update({ notes: trimmed.length > 0 ? trimmed : null })
      .eq("id", row.id);

    if (saveError) {
      warned();
      Alert.alert("Couldn't save those notes", saveError.message);
      return;
    }
    load();
  }

  async function setPhoto(row: KeyDateRow, path: string | null): Promise<boolean> {
    const before = row.photo_path;
    setDates((prev) => prev.map((d) => (d.id === row.id ? { ...d, photo_path: path } : d)));

    // .select, so an update that matched no row -- deleted on the other
    // phone -- reports as the failure it is. The photo tile deletes the old
    // file on the strength of this answer.
    const { data, error: photoError } = await supabase
      .from("key_dates")
      .update({ photo_path: path })
      .eq("id", row.id)
      .select("id");

    if (photoError || (data?.length ?? 0) === 0) {
      warned();
      setDates((prev) => prev.map((d) => (d.id === row.id ? { ...d, photo_path: before } : d)));
      Alert.alert(
        "Couldn't save that photo",
        photoError?.message ?? "That day isn't there any more."
      );
      return false;
    }

    return true;
  }

  async function togglePin(row: KeyDateRow) {
    tapped();
    setDates((prev) => prev.map((d) => (d.id === row.id ? { ...d, pinned: !d.pinned } : d)));

    const { error: pinError } = await supabase
      .from("key_dates")
      .update({ pinned: !row.pinned })
      .eq("id", row.id);

    if (pinError) {
      warned();
      Alert.alert("Couldn't change that", pinError.message);
    }
    load();
  }

  async function setEndDate(row: KeyDateRow, endDate: string | null) {
    // Turning a date into a trip means it is a specific trip, not something
    // that happens every year. "Bali 2026" recurring in 2027 is not what
    // anyone meant, and the countdown would be wrong from the day it ended.
    const patch = endDate
      ? { end_date: endDate, recurring: false }
      : { end_date: null };

    const { error: tripError } = await supabase.from("key_dates").update(patch).eq("id", row.id);

    if (tripError) {
      warned();
      Alert.alert("Couldn't save that", tripError.message);
      return;
    }
    succeeded();
    load();
  }

  function startEditing(row: KeyDateRow) {
    setEditingId(row.id);
    setEditTitle(row.title);
    setError(null);
  }

  async function saveEdit(row: KeyDateRow, patch: { title?: string; date?: string }) {
    const title = (patch.title ?? row.title).trim();
    if (!title) {
      warned();
      // Said where the editing is happening. The banner this used to set
      // lives at the top of a list that can be several screens long.
      Alert.alert("It needs a name", "Give this one a name before saving it.");
      return;
    }

    const { error: updateError } = await supabase
      .from("key_dates")
      .update({ title, date: patch.date ?? row.date })
      .eq("id", row.id);

    if (updateError) {
      warned();
      Alert.alert("Couldn't save that", updateError.message);
      return;
    }

    succeeded();
    load();
  }

  function confirmRemoveMisc(row: KeyDateRow) {
    Alert.alert(`Delete "${row.title}"?`, "Its reminders go with it, for both of you.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setEditingId(null);
          removeMisc(row.id);
        },
      },
    ]);
  }

  async function removeMisc(id: string) {
    const photo = dates.find((d) => d.id === id)?.photo_path ?? null;
    // Removed from the list first so it feels instant; if the delete fails the
    // reload below puts it back, which would otherwise look like a ghost.
    setDates((prev) => prev.filter((d) => d.id !== id));
    const { error: deleteError } = await supabase.from("key_dates").delete().eq("id", id);
    if (deleteError) {
      warned();
      Alert.alert("Couldn't remove that", deleteError.message);
      load();
      return;
    }

    await removePhoto(photo);
    load();
  }

  const miscDates = dates.filter((d) => d.kind === "misc");

  const anniversaryRow = dates.find((d) => d.kind === "anniversary") ?? null;
  const myBirthdayRow =
    dates.find((d) => d.kind === "birthday" && d.subject_user_id === myId) ?? null;
  const partnerBirthdayRow =
    dates.find((d) => d.kind === "birthday" && d.subject_user_id === partnerId) ?? null;

  function detailsFor(row: KeyDateRow | null, title: string) {
    if (!row) return null;
    const open = openDetailId === row.id;

    return (
      <>
        <ReminderSummary row={row} title={title} onToggle={toggleRemindersOn} />
        <Pressable
          onPress={() => setOpenDetailId(open ? null : row.id)}
          style={press(styles.detailsToggle)}
          hitSlop={6}
        >
          <Text style={styles.detailsToggleText}>
            {open ? "Hide reminders & notes" : "Reminders & notes"}
          </Text>
          <Text style={styles.detailsToggleSummary}>
            {row.notes ? "Has notes · " : ""}
            {describeReminders(row.reminder_days ?? DEFAULT_REMINDER_DAYS)}
          </Text>
        </Pressable>
        {open ? (
          <DetailsPanel
            row={row}
            coupleId={profile?.couple_id ?? null}
            onToggle={toggleReminder}
            onSaveNotes={saveNotes}
            onTogglePin={togglePin}
            onSetEndDate={setEndDate}
            onSetPhoto={setPhoto}
          />
        ) : null}
      </>
    );
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
      <Text style={styles.title}>Unforgettable Days</Text>
      <Text style={styles.subtitle}>
        Reminders land at 9am, 2 weeks, 1 week and 3 days before by default. Change that per date
        under Reminders &amp; notes. Dates save as soon as you pick them.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Anniversary Date</Text>
          {anniversaryInput ? (
            <Pressable onPress={() => clearSingleton("anniversary")} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <DateField
          value={anniversaryInput || null}
          placeholder="Pick your anniversary"
          onChange={(iso) => {
            setAnniversaryInput(iso);
            saveSingleton("anniversary", iso, "Anniversary");
          }}
        />
        {detailsFor(anniversaryRow, "Anniversary")}
      </View>

      {partner ? (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>{partnerName}&apos;s Birthday</Text>
          {partnerBirthdayInput ? (
            <Pressable onPress={() => clearSingleton("birthday", partnerId)} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        <DateField
          value={partnerBirthdayInput || null}
          placeholder={`Pick ${partnerName}'s birthday`}
          maximumDate={new Date()}
          onChange={(iso) => {
            setPartnerBirthdayInput(iso);
            saveSingleton("birthday", iso, "Birthday", partnerId);
          }}
        />
        {detailsFor(partnerBirthdayRow, `${partnerName}'s birthday`)}
      </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardTitle}>Your Birthday</Text>
          {myBirthdayInput ? (
            <Pressable onPress={() => clearSingleton("birthday", myId)} hitSlop={8}>
              <Text style={styles.clear}>Clear</Text>
            </Pressable>
          ) : null}
        </View>
        {partner ? (
          <Text style={styles.cardHint}>So {partnerName} gets the reminders for yours too.</Text>
        ) : (
          <Text style={styles.cardHint}>
            So it is already here when somebody else arrives to be reminded.
          </Text>
        )}
        <DateField
          value={myBirthdayInput || null}
          placeholder="Pick your birthday"
          maximumDate={new Date()}
          onChange={(iso) => {
            setMyBirthdayInput(iso);
            saveSingleton("birthday", iso, "Birthday", myId);
          }}
        />
        {detailsFor(myBirthdayRow, "Your birthday")}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Anything else</Text>
        <Text style={styles.cardHint}>
          One-off dates, trips, anniversaries of other things. Give it an end date and it becomes a
          trip.
        </Text>
        {miscDates.map((d) =>
          editingId === d.id ? (
            <View key={d.id} style={styles.miscEditor}>
              <TextInput
                style={styles.input}
                value={editTitle}
                onChangeText={setEditTitle}
                placeholder="What is it?"
                placeholderTextColor={t.textMuted}
                autoFocus
                onSubmitEditing={() => {
                  saveEdit(d, { title: editTitle });
                  setEditingId(null);
                }}
              />
              <View style={{ marginTop: 8 }}>
                <DateField
                  value={d.date}
                  placeholder="Pick a date"
                  onChange={(iso) => saveEdit(d, { title: editTitle, date: iso })}
                />
              </View>
              <ReminderSummary row={d} title={d.title} onToggle={toggleRemindersOn} />
              <DetailsPanel
                row={d}
                coupleId={profile?.couple_id ?? null}
                onToggle={toggleReminder}
                onSaveNotes={saveNotes}
                onTogglePin={togglePin}
                onSetEndDate={setEndDate}
                onSetPhoto={setPhoto}
              />
              <View style={styles.miscEditorActions}>
                <Pressable
                  onPress={() => {
                    saveEdit(d, { title: editTitle });
                    setEditingId(null);
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.clear}>Done</Text>
                </Pressable>
                <Pressable onPress={() => confirmRemoveMisc(d)} hitSlop={8}>
                  <Text style={[styles.clear, styles.clearDanger]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              key={d.id}
              style={press(styles.miscRow)}
              onPress={() => startEditing(d)}
              onLongPress={() => confirmRemoveMisc(d)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.miscTitle}>{d.title}</Text>
                {d.notes ? (
                  <Text style={styles.miscNotes} numberOfLines={1}>
                    {d.notes}
                  </Text>
                ) : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.miscDate}>
                  {d.end_date
                    ? `${toFriendlyDate(d.date)} – ${toFriendlyDate(d.end_date)}`
                    : toFriendlyDate(d.date)}
                </Text>
                <Text style={styles.miscCountdown}>
                  {d.pinned ? "Pinned · " : ""}
                  {countdownLabel(d)}
                  {d.reminders_on === false ? " · reminders off" : ""}
                </Text>
              </View>
            </Pressable>
          )
        )}
        {miscDates.length > 0 && editingId === null ? (
          <Text style={styles.cardHint}>Tap one to rename or re-date it.</Text>
        ) : null}
        <TextInput
          style={styles.input}
          placeholder="What is it?"
          placeholderTextColor={t.textMuted}
          value={miscTitle}
          onChangeText={setMiscTitle}
        />
        <View style={{ marginTop: 8 }}>
          <DateField
            value={miscDate || null}
            placeholder="Pick a date"
            onChange={setMiscDate}
          />
        </View>
        {miscDate ? (
          <View style={{ marginTop: 8 }}>
            <DateField
              value={miscEnd || null}
              placeholder="Runs until (optional)"
              minimumDate={fromISODate(miscDate) ?? undefined}
              onChange={setMiscEnd}
            />
          </View>
        ) : null}
        {miscEnd ? (
          <Text style={styles.detailsHint}>
            A trip. It won&apos;t repeat next year, and it&apos;ll show across the whole stretch on
            your calendar.
          </Text>
        ) : null}
        <Pressable style={press([styles.saveButton, { alignSelf: "flex-start", marginTop: 8 }])} onPress={addMisc}>
          <Text style={styles.saveButtonText}>+ Add another</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: t.space(6), paddingTop: t.space(14), paddingBottom: 40 },
  title: { ...t.type.display, color: t.textPrimary, marginBottom: 8 },
  subtitle: { ...t.type.body, color: t.textSecondary, marginBottom: t.space(6) },
  error: { ...t.type.label, color: t.danger, marginBottom: t.space(3) },
  card: { ...t.card, padding: t.space(5), marginBottom: 16 },
  cardTitle: { ...t.type.title, color: t.textPrimary, marginBottom: t.space(3) },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  clear: { ...t.type.label, color: t.accent, marginBottom: t.space(3) },
  clearDanger: { color: t.danger },
  miscEditor: {
    paddingVertical: t.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  miscEditorActions: { flexDirection: "row", gap: 18, marginTop: 12 },
  cardHint: { ...t.type.caption, color: t.textMuted, marginBottom: t.space(3) },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: t.bg,
    borderRadius: t.radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: t.border,
    paddingHorizontal: t.space(4),
    paddingVertical: t.space(3),
    ...t.type.body,
    // Without this the text renders in the platform default (black), which on
    // the dark theme's dark background is invisible -- the same bug the date
    // picker had.
    color: t.textPrimary,
  },
  saveButton: {
    backgroundColor: t.accent,
    borderRadius: t.radius.pill,
    paddingHorizontal: t.space(5),
    justifyContent: "center",
  },
  saveButtonText: { ...t.type.label, color: t.textOnBrand },
  miscRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: t.space(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: t.border,
  },
  miscTitle: { ...t.type.heading, color: t.textPrimary },
  miscNotes: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
  miscCountdown: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
  detailsRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  pinRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
  },
  summary: {
    marginTop: t.space(4),
    paddingTop: t.space(4),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: t.border,
  },
  // The whole point of a key date. It was set two pixels larger than the hint
  // underneath it, which is to say it was not treated as the point of
  // anything.
  summaryCountdown: { ...t.type.title, color: t.brand },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  summaryLabel: { ...t.type.label, color: t.textSecondary },
  summaryNext: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
  detailsToggle: { marginTop: t.space(4) },
  detailsToggleText: { ...t.type.label, color: t.accent },
  detailsToggleSummary: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
  details: { marginTop: 12 },
  // A field label, not an eyebrow. The eyebrow token uppercases, and
  // "RUNS UNTIL (OPTIONAL)" is a sentence being shouted.
  detailsLabel: { ...t.type.label, color: t.textSecondary, marginBottom: t.space(2) },
  detailsHint: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: t.space(4),
    paddingVertical: t.space(2),
    borderRadius: t.radius.pill,
    backgroundColor: t.surfaceSunken,
  },
  chipOn: { backgroundColor: t.accentSoft },
  chipText: { ...t.type.label, color: t.textSecondary },
  chipTextOn: { color: t.accent },
  notesInput: { minHeight: 72, textAlignVertical: "top", paddingTop: t.space(3) },
  miscDate: { ...t.type.caption, color: t.textMuted },
  });
