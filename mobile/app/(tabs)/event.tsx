import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { press } from "@/components/press";
import { succeeded, warned } from "@/lib/haptics";
import { DateField, TimeField } from "@/components/fields";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { usePartnerColors } from "@/hooks/usePartnerColors";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { shadeFor } from "@/lib/palette";
import { supabase } from "@/lib/supabase";
import { toISODate, fromISODate, toTimeString, fromTimeString } from "@/lib/dates";
import {
  EVENT_COLUMNS,
  PlannedEvent,
  createPlannedEvent,
  updatePlannedEvent,
  deletePlannedEvent,
  syncPlannedEventsToDevice,
} from "@/lib/plannedEvents";
import {
  DeviceEventRow,
  Editability,
  SeriesScope,
  canEdit,
  deleteDeviceEvent,
  loadDeviceEvent,
  updateDeviceEvent,
} from "@/lib/deviceEvents";
import { syncBusyBlocks } from "@/lib/calendarSync";
import { REPEAT_OPTIONS, RepeatEvery } from "@/lib/recurrence";

/** Combine an ISO date and an HH:MM time into a real instant. */
function combine(isoDate: string, time: string): Date {
  const base = fromISODate(isoDate) ?? new Date();
  const at = fromTimeString(time);
  const out = new Date(base);
  out.setHours(at.getHours(), at.getMinutes(), 0, 0);
  return out;
}

export default function EventEditor() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { session, profile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const colors = usePartnerColors();

  const params = useLocalSearchParams<{
    id?: string;
    /** A row in busy_blocks: an event that lives in the phone's own calendar. */
    busy?: string;
    date?: string;
    start?: string;
  }>();
  const editingId = params.id ?? null;
  const busyId = params.busy ?? null;

  // Two quite different things share this screen. An Untangled Life event is
  // ours: owner, colour, push toggles, stored in planned_events. A synced
  // event belongs to Google or Apple and we are only allowed to move it --
  // there is no owner to set and nothing to push, because it is already in the
  // calendar it came from.
  const [deviceEvent, setDeviceEvent] = useState<DeviceEventRow | null>(null);
  const [editability, setEditability] = useState<Editability>({ editable: true });

  const myId = me.id;
  const partnerId = partner?.id ?? null;
  const myName = me.display_name ?? "Me";
  const partnerName = partner?.display_name ?? "Partner";

  const [loaded, setLoaded] = useState(!editingId);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState("");

  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");

  // Null is "Us". Storing the id rather than a label means a rename doesn't
  // orphan the event, and the colour follows the person.
  const [owner, setOwner] = useState<string | null>(null);
  const [pushTo, setPushTo] = useState<string[]>([]);
  const [repeatEvery, setRepeatEvery] = useState<RepeatEvery>("none");
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);

  /**
   * An hour after the start -- rolling the DATE forward when that crosses
   * midnight.
   *
   * slotAt clamps to 23:30, so tapping the bottom of the day grid opens this
   * screen at 23:30. Adding an hour to the time alone gave 00:30 on the same
   * date, which save() then refuses as ending before it starts -- every tap in
   * the last hour of the day was unsaveable, and the alert pointed at the
   * times rather than the date that was actually wrong.
   */
  function defaultEnd(date: string, time: string): { date: string; time: string } {
    const at = fromTimeString(time);
    const rolled = at.getHours() + 1 >= 24;
    at.setHours(at.getHours() + 1);

    if (!rolled) return { date, time: toTimeString(at) };

    const nextDay = fromISODate(date) ?? new Date();
    nextDay.setDate(nextDay.getDate() + 1);
    return { date: toISODate(nextDay), time: toTimeString(at) };
  }

  /**
   * This screen is a hidden TAB route, so it stays mounted between visits:
   * pushing to it with new params never re-runs a useState initialiser.
   * Without this, tapping 2pm on the grid after cancelling out of a 10am draft
   * reopens the 10am draft, title and all -- and saves an event at a time
   * nobody chose.
   */
  const routeKey = `${params.id ?? ""}|${params.busy ?? ""}|${params.date ?? ""}|${params.start ?? ""}`;
  useEffect(() => {
    if (editingId || busyId) {
      setLoaded(false);
      return;
    }

    const date = params.date ?? toISODate(new Date());
    const time = params.start ?? "09:00";
    const end = defaultEnd(date, time);

    setTitle("");
    setNotes("");
    setLocation("");
    setStartDate(date);
    setStartTime(time);
    setEndDate(end.date);
    setEndTime(end.time);
    setOwner(null);
    setPushTo([]);
    setRepeatEvery("none");
    setRepeatUntil(null);
    setLoaded(true);
    // routeKey collapses the params this depends on into one value, so the
    // draft is reset exactly when a new event is started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, editingId, busyId]);

  const loadDevice = useCallback(async () => {
    if (!busyId || !session?.user.id) return;

    const row = await loadDeviceEvent(busyId);
    if (!row) {
      setLoaded(true);
      return;
    }

    const start = new Date(row.start_at);
    const end = new Date(row.end_at);

    setDeviceEvent(row);
    setEditability(await canEdit(row, session.user.id));
    setTitle(row.title ?? "");
    setNotes(row.notes ?? "");
    setLocation(row.location ?? "");
    setStartDate(toISODate(start));
    setStartTime(toTimeString(start));
    setEndDate(toISODate(end));
    setEndTime(toTimeString(end));
    setLoaded(true);
  }, [busyId, session?.user.id]);

  const load = useCallback(async () => {
    if (!editingId) return;

    const { data } = await supabase
      .from("planned_events")
      .select(EVENT_COLUMNS)
      .eq("id", editingId)
      .maybeSingle();

    if (data) {
      const ev = data as PlannedEvent;
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);

      setTitle(ev.title);
      setNotes(ev.notes ?? "");
      setLocation(ev.location ?? "");
      setStartDate(toISODate(start));
      setStartTime(toTimeString(start));
      setEndDate(toISODate(end));
      setEndTime(toTimeString(end));
      setOwner(ev.owner_user_id);
      setPushTo(ev.push_to ?? []);
      setRepeatEvery(ev.repeat_every ?? "none");
      setRepeatUntil(ev.repeat_until ?? null);
    }
    setLoaded(true);
  }, [editingId]);

  useRefreshOnFocus(load);
  useRefreshOnFocus(loadDevice);

  function togglePush(userId: string) {
    setPushTo((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
  }

  /**
   * Which occurrences a change applies to.
   *
   * Only asked for a repeating event, because for anything else there is
   * nothing to choose and a dialog would just be in the way. "All" means this
   * one and every one after it, which is what Apple and Google mean by it --
   * neither of them rewrites the past, and neither should we.
   */
  function askScope(action: string, onChoose: (scope: SeriesScope) => void) {
    Alert.alert(
      "This repeats",
      `${action} just this one, or this one and all the ones after it?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Just this one", onPress: () => onChoose("single") },
        { text: "This and future", onPress: () => onChoose("future") },
      ]
    );
  }

  async function saveDeviceEvent(scope: SeriesScope) {
    if (!deviceEvent || !session?.user.id || !profile?.couple_id) return;

    setSaving(true);

    const { error } = await updateDeviceEvent(
      deviceEvent,
      {
        title: title.trim(),
        startDate: combine(startDate, startTime),
        endDate: combine(endDate, endTime),
        location: location.trim() || null,
        notes: notes.trim() || null,
      },
      scope
    );

    if (error) {
      setSaving(false);
      warned();
      Alert.alert("Couldn't change that", error);
      return;
    }

    // Re-read the calendar so the app shows what the phone now holds, rather
    // than what we asked for. If the calendar quietly adjusted something, the
    // app should agree with it.
    await syncBusyBlocks(profile.couple_id, session.user.id);

    succeeded();
    setSaving(false);
    router.back();
  }

  async function save() {
    if (!session?.user.id || !profile?.couple_id || saving) return;

    const name = title.trim();
    if (!name) {
      warned();
      Alert.alert("It needs a name", "What is this event?");
      return;
    }

    const start = combine(startDate, startTime);
    const end = combine(endDate, endTime);

    if (end <= start) {
      warned();
      Alert.alert("Check the times", "The event has to finish after it starts.");
      return;
    }

    if (deviceEvent) {
      if (!editability.editable) {
        warned();
        Alert.alert("Can't change this one", editability.reason);
        return;
      }

      if (deviceEvent.recurring) {
        askScope("Change", (scope) => saveDeviceEvent(scope));
        return;
      }

      saveDeviceEvent("single");
      return;
    }

    setSaving(true);

    const { error } = editingId
      ? await updatePlannedEvent(editingId, {
          byUserId: session.user.id,
          title: name,
          startAt: start,
          endAt: end,
          location: location.trim() || null,
          notes: notes.trim() || null,
          ownerUserId: owner,
          pushTo,
          repeatEvery,
          repeatUntil,
        })
      : await createPlannedEvent({
          coupleId: profile.couple_id,
          userId: session.user.id,
          title: name,
          startAt: start,
          endAt: end,
          location: location.trim() || undefined,
          notes: notes.trim() || undefined,
          ownerUserId: owner,
          pushTo,
          repeatEvery,
          repeatUntil,
        });

    if (error) {
      setSaving(false);
      warned();
      Alert.alert("Couldn't save that", error.message);
      return;
    }

    // Put it on this phone's calendar now if it's meant to be there, rather
    // than whenever Home next syncs. The partner's phone picks theirs up on
    // their next open -- a phone can only write to its own calendar.
    await syncPlannedEventsToDevice(session.user.id);

    succeeded();
    setSaving(false);
    router.back();
  }

  async function removeDeviceEvent(scope: SeriesScope) {
    if (!deviceEvent || !session?.user.id || !profile?.couple_id) return;

    setSaving(true);
    const { error } = await deleteDeviceEvent(deviceEvent, scope);

    if (error) {
      setSaving(false);
      warned();
      Alert.alert("Couldn't delete that", error);
      return;
    }

    await syncBusyBlocks(profile.couple_id, session.user.id);
    succeeded();
    router.back();
  }

  function confirmDeleteDevice() {
    if (!deviceEvent) return;

    Alert.alert(
      `Delete "${title}"?`,
      "This removes it from the calendar it came from, not just from Untangled Life.",
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () =>
            deviceEvent.recurring
              ? askScope("Delete", (scope) => removeDeviceEvent(scope))
              : removeDeviceEvent("single"),
        },
      ]
    );
  }

  function confirmDelete() {
    if (!editingId) return;

    Alert.alert(`Delete "${title}"?`, "It comes off both your phone calendars too.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          const { error } = await deletePlannedEvent(editingId, session?.user.id);

          if (error) {
            setSaving(false);
            warned();
            Alert.alert("Couldn't delete that", error.message);
            return;
          }

          if (session?.user.id) await syncPlannedEventsToDevice(session.user.id);
          succeeded();
          router.back();
        },
      },
    ]);
  }

  function nameFor(userId: string): string {
    return userId === myId ? "your" : `${partnerName}'s`;
  }

  const ownerOptions: { id: string | null; label: string }[] = [
    { id: myId, label: myName },
    ...(partnerId ? [{ id: partnerId, label: partnerName }] : []),
    { id: null, label: "Us" },
  ];

  const ownerShade = (() => {
    const color = colors.forOwner(owner);
    return color ? shadeFor(color, t.scheme) : null;
  })();

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <View style={styles.topRow}>
        <Pressable onPress={() => router.back()} hitSlop={8}>
          <Text style={styles.back}>Cancel</Text>
        </Pressable>
        {deviceEvent && !editability.editable ? (
          <Text style={styles.readOnlyTag}>Read only</Text>
        ) : (
          <Pressable onPress={save} hitSlop={8} disabled={saving}>
            <Text style={[styles.save, saving ? styles.saveOff : null]}>
              {saving ? "Saving…" : editingId || deviceEvent ? "Save" : "Add"}
            </Text>
          </Pressable>
        )}
      </View>

      <TextInput
        style={[
          styles.titleInput,
          ownerShade ? { backgroundColor: ownerShade.fill, color: ownerShade.ink } : null,
        ]}
        value={title}
        onChangeText={setTitle}
        editable={!deviceEvent || editability.editable}
        placeholder="What is it?"
        placeholderTextColor={ownerShade ? ownerShade.ink : t.textMuted}
        autoFocus={!editingId}
      />

      {deviceEvent ? (
        <View style={[styles.banner, editability.editable ? null : styles.bannerWarn]}>
          <Text style={styles.bannerText}>
            {editability.editable
              ? `This lives in ${nameFor(deviceEvent.user_id)} phone calendar. Changing it here changes it there${deviceEvent.recurring ? ", and it repeats, so you'll be asked which ones" : ""}.`
              : editability.reason}
          </Text>
        </View>
      ) : null}

      {deviceEvent ? null : <Text style={styles.groupTitle}>Whose is it?</Text>}
      {deviceEvent ? null : (
      <View style={styles.segmented}>
        {ownerOptions.map((option) => {
          const active = owner === option.id;
          return (
            <Pressable
              key={option.label}
              style={press([styles.segment, active ? styles.segmentActive : null])}
              onPress={() => setOwner(option.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      )}
      {deviceEvent ? null : (
        <Text style={styles.hint}>Sets the colour it shows in. Both of you see it either way.</Text>
      )}

      <Text style={styles.groupTitle}>When</Text>
      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Starts</Text>
        <DateField
          value={startDate}
          onChange={(iso) => {
            setStartDate(iso);
            // Almost every event ends on the day it starts, and an end date
            // silently left behind produces a week-long lunch.
            if (endDate < iso) setEndDate(iso);
          }}
        />
        <View style={{ marginTop: 8 }}>
          <TimeField
            value={startTime}
            onChange={(time) => {
              setStartTime(time);
              // Moving the start past the end is the common way to end up with
              // a rejected save. Carry the end along unless it's been set
              // somewhere clearly deliberate.
              if (endDate === startDate && endTime <= time) {
                const end = defaultEnd(startDate, time);
                setEndDate(end.date);
                setEndTime(end.time);
              }
            }}
          />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.fieldLabel}>Ends</Text>
        <DateField
          value={endDate}
          minimumDate={fromISODate(startDate) ?? undefined}
          onChange={setEndDate}
        />
        <View style={{ marginTop: 8 }}>
          <TimeField value={endTime} onChange={setEndTime} />
        </View>
      </View>

      {deviceEvent ? null : <Text style={styles.groupTitle}>Repeats</Text>}
      {deviceEvent ? null : (
        <View style={styles.segmented}>
          {REPEAT_OPTIONS.map((option) => {
            const active = repeatEvery === option.key;
            return (
              <Pressable
                key={option.key}
                style={press([styles.segment, active ? styles.segmentActive : null])}
                onPress={() => {
                  setRepeatEvery(option.key);
                  // An end date on something that no longer repeats is a
                  // contradiction the database rejects, so clearing the repeat
                  // clears the end with it.
                  if (option.key === "none") setRepeatUntil(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.segmentText, active ? styles.segmentTextActive : null]}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!deviceEvent && repeatEvery !== "none" ? (
        <View style={[styles.card, { marginTop: 12 }]}>
          <Text style={styles.fieldLabel}>Until (optional)</Text>
          <DateField
            value={repeatUntil}
            placeholder="Keeps going"
            minimumDate={fromISODate(startDate) ?? undefined}
            onChange={setRepeatUntil}
          />
          {repeatUntil ? (
            <Pressable onPress={() => setRepeatUntil(null)} hitSlop={8}>
              <Text style={[styles.hint, { color: t.accent, fontWeight: "600" }]}>
                Remove the end date
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {deviceEvent ? null : <Text style={styles.groupTitle}>Push to calendar</Text>}
      {deviceEvent ? null : (
      <View style={styles.card}>
        <View style={styles.pushRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>{myName}&apos;s phone</Text>
            <Text style={styles.hint}>Adds it to your own calendar app</Text>
          </View>
          <Switch
            value={pushTo.includes(myId)}
            onValueChange={() => togglePush(myId)}
            trackColor={{ true: t.brand, false: t.surfaceSunken }}
          />
        </View>

        {partnerId ? (
          <View style={[styles.pushRow, styles.rowDivider]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>{partnerName}&apos;s phone</Text>
              <Text style={styles.hint}>Lands next time they open the app</Text>
            </View>
            <Switch
              value={pushTo.includes(partnerId)}
              onValueChange={() => togglePush(partnerId)}
              trackColor={{ true: t.brand, false: t.surfaceSunken }}
            />
          </View>
        ) : null}
      </View>
      )}
      {deviceEvent ? null : (
        <Text style={styles.hint}>
          Off means it stays in Untangled Life. You&apos;ll both still see it here.
        </Text>
      )}

      <Text style={styles.groupTitle}>Where</Text>
      <TextInput
        style={styles.input}
        value={location}
        onChangeText={setLocation}
        placeholder="Optional"
        placeholderTextColor={t.textMuted}
      />

      <Text style={styles.groupTitle}>Notes</Text>
      <TextInput
        style={[styles.input, styles.notesInput]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Anything worth remembering"
        placeholderTextColor={t.textMuted}
        multiline
      />

      {editingId ? (
        <Pressable style={press(styles.deleteButton)} onPress={confirmDelete}>
          <Text style={styles.deleteText}>Delete event</Text>
        </Pressable>
      ) : deviceEvent && editability.editable ? (
        <Pressable style={press(styles.deleteButton)} onPress={confirmDeleteDevice}>
          <Text style={styles.deleteText}>Delete from the calendar it came from</Text>
        </Pressable>
      ) : null}
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
      paddingTop: t.space(14),
      paddingBottom: t.space(16),
    },
    topRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: t.space(5),
    },
    back: { fontSize: 15, color: t.textSecondary },
    save: { fontSize: 15, color: t.accent, fontWeight: "700" },
    saveOff: { color: t.textMuted },
    readOnlyTag: { fontSize: 13, color: t.textMuted, fontWeight: "600" },
    banner: {
      backgroundColor: t.accentSoft,
      borderRadius: t.radius.md,
      padding: t.space(3),
      marginTop: t.space(4),
    },
    bannerWarn: { backgroundColor: t.surfaceSunken },
    bannerText: { fontSize: 12, lineHeight: 18, color: t.textSecondary },
    titleInput: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(4),
      fontSize: 19,
      fontWeight: "600",
      color: t.textPrimary,
    },
    groupTitle: {
      fontSize: 12,
      fontWeight: "700",
      color: t.textSecondary,
      marginTop: t.space(6),
      marginBottom: t.space(2),
      letterSpacing: 0.4,
      textTransform: "uppercase",
    },
    card: {
      backgroundColor: t.surface,
      borderRadius: t.radius.lg,
      padding: t.space(4),
      marginBottom: t.space(3),
    },
    fieldLabel: { fontSize: 13, fontWeight: "600", color: t.textSecondary, marginBottom: t.space(2) },
    segmented: {
      flexDirection: "row",
      backgroundColor: t.surfaceSunken,
      borderRadius: t.radius.md,
      padding: 3,
    },
    segment: { flex: 1, paddingVertical: t.space(2), borderRadius: t.radius.sm, alignItems: "center" },
    segmentActive: { backgroundColor: t.surface, ...t.shadow },
    segmentText: { fontSize: 13, fontWeight: "600", color: t.textMuted },
    segmentTextActive: { color: t.brand },
    hint: { fontSize: 11, color: t.textMuted, marginTop: t.space(2), lineHeight: 16 },
    pushRow: { flexDirection: "row", alignItems: "center", gap: t.space(3), paddingVertical: t.space(2) },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: t.border,
      marginTop: t.space(2),
      paddingTop: t.space(3),
    },
    rowLabel: { fontSize: 15, fontWeight: "500", color: t.textPrimary },
    input: {
      backgroundColor: t.surface,
      borderRadius: t.radius.md,
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(3),
      fontSize: 15,
      color: t.textPrimary,
    },
    notesInput: { minHeight: 96, textAlignVertical: "top", paddingTop: t.space(3) },
    deleteButton: { alignItems: "center", marginTop: t.space(8) },
    deleteText: { fontSize: 15, fontWeight: "600", color: t.danger },
  });
