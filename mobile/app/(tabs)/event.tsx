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

  const params = useLocalSearchParams<{ id?: string; date?: string; start?: string }>();
  const editingId = params.id ?? null;

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
  const routeKey = `${params.id ?? ""}|${params.date ?? ""}|${params.start ?? ""}`;
  useEffect(() => {
    if (editingId) {
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
    setLoaded(true);
    // routeKey collapses the params this depends on into one value, so the
    // draft is reset exactly when a new event is started.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey, editingId]);

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
    }
    setLoaded(true);
  }, [editingId]);

  useRefreshOnFocus(load);

  function togglePush(userId: string) {
    setPushTo((current) =>
      current.includes(userId) ? current.filter((id) => id !== userId) : [...current, userId]
    );
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

    setSaving(true);

    const { error } = editingId
      ? await updatePlannedEvent(editingId, {
          title: name,
          startAt: start,
          endAt: end,
          location: location.trim() || null,
          notes: notes.trim() || null,
          ownerUserId: owner,
          pushTo,
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

  function confirmDelete() {
    if (!editingId) return;

    Alert.alert(`Delete "${title}"?`, "It comes off both your phone calendars too.", [
      { text: "Keep it", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setSaving(true);
          const { error } = await deletePlannedEvent(editingId);

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
        <Pressable onPress={save} hitSlop={8} disabled={saving}>
          <Text style={[styles.save, saving ? styles.saveOff : null]}>
            {saving ? "Saving…" : editingId ? "Save" : "Add"}
          </Text>
        </Pressable>
      </View>

      <TextInput
        style={[
          styles.titleInput,
          ownerShade ? { backgroundColor: ownerShade.fill, color: ownerShade.ink } : null,
        ]}
        value={title}
        onChangeText={setTitle}
        placeholder="What is it?"
        placeholderTextColor={ownerShade ? ownerShade.ink : t.textMuted}
        autoFocus={!editingId}
      />

      <Text style={styles.groupTitle}>Whose is it?</Text>
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
      <Text style={styles.hint}>Sets the colour it shows in. Both of you see it either way.</Text>

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

      <Text style={styles.groupTitle}>Push to calendar</Text>
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
      <Text style={styles.hint}>
        Off means it stays in Untangled Life. You&apos;ll both still see it here.
      </Text>

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
