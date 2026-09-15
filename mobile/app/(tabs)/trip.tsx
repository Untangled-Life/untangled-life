import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Switch,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { press } from "@/components/press";
import { succeeded, tapped, warned } from "@/lib/haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { DateField } from "@/components/fields";
import { PhotoTile } from "@/components/photo-tile";
import { ActionSheet, type SheetAction } from "@/components/action-sheet";
import { SwipeRow } from "@/components/swipe-row";
import { removePhoto } from "@/lib/photos";
import {
  ADD_HINT,
  SECTIONS,
  Trip,
  TripItem,
  TripItemKind,
  byWhen,
  tripNights,
  tripWhen,
} from "@/lib/trips";

/**
 * One trip: everything you have booked, and everything you have not.
 *
 * The second half is the point. Most of a trip exists as screenshots long
 * before any of it is confirmed -- a flight somebody found, a hotel a friend
 * sent, a list of things to do that nobody has priced. An app that only
 * accepts confirmed bookings is an app you fill in after the holiday.
 */
export default function TripScreen() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { profile } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const tripId = params.id ?? null;

  const [trip, setTrip] = useState<Trip | null>(null);
  const [items, setItems] = useState<TripItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [readFailed, setReadFailed] = useState(false);

  const [draftFor, setDraftFor] = useState<TripItemKind | null>(null);
  const [draftTitle, setDraftTitle] = useState("");

  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const load = useCallback(async () => {
    if (!tripId) {
      // Nothing to read, so nothing to wait for. `trip` stays null, which is
      // what the screen reads as "not here".
      setLoaded(true);
      return;
    }

    const [tripRes, itemRes] = await Promise.all([
      supabase
        .from("trips")
        .select("id, title, destination, start_date, end_date, notes, cover_path, booked")
        .eq("id", tripId)
        .maybeSingle(),
      supabase
        .from("trip_items")
        .select("id, trip_id, kind, title, detail, at_date, at_time, reference, url, photo_path, booked")
        .eq("trip_id", tripId),
    ]);

    // A read that failed is not a trip that has been deleted, and saying so
    // would send somebody back to the list looking for something that is
    // still there. It is not a reason to spin forever either.
    if (tripRes.error || itemRes.error) {
      setReadFailed(true);
      setLoaded(true);
      return;
    }

    setReadFailed(false);

    setTrip((tripRes.data as Trip) ?? null);
    setItems((itemRes.data as TripItem[]) ?? []);
    setLoaded(true);
  }, [tripId]);

  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  /** Returns whether it stuck, which is what the photo tile deletes on. */
  async function patchTrip(patch: Partial<Trip>): Promise<boolean> {
    if (!tripId || !trip) return false;

    // Only the keys being patched, and through an updater. Uploading a photo
    // sends the screen to the system picker and back, which fires a refresh
    // -- so by the time this runs, the `trip` in the closure can be older
    // than what is on screen, and writing it back whole would quietly undo
    // whatever the refresh brought in.
    const before: Partial<Trip> = {};
    for (const key of Object.keys(patch) as (keyof Trip)[]) {
      (before as Record<string, unknown>)[key] = trip[key];
    }

    setTrip((prev) => (prev ? { ...prev, ...patch } : prev));

    // .select, so a write that matched no row -- deleted on the other phone,
    // or no longer ours -- is reported as the failure it is rather than as a
    // success. The photo tile deletes the old file on the strength of this.
    const { data, error } = await supabase
      .from("trips")
      .update(patch)
      .eq("id", tripId)
      .select("id");

    if (error || (data?.length ?? 0) === 0) {
      warned();
      setTrip((prev) => (prev ? { ...prev, ...before } : prev));
      Alert.alert("Couldn't save that", error?.message ?? "That trip isn't there any more.");
      return false;
    }

    return true;
  }

  async function addItem(kind: TripItemKind) {
    const title = draftTitle.trim();
    if (!title || !tripId || !profile?.couple_id) return;

    setDraftTitle("");
    setDraftFor(null);

    const { error } = await supabase.from("trip_items").insert({
      couple_id: profile.couple_id,
      trip_id: tripId,
      added_by: profile.id,
      kind,
      title,
    });

    if (error) {
      warned();
      Alert.alert("Couldn't add that", error.message);
      return;
    }

    succeeded();
    load();
  }

  async function patchItem(id: string, patch: Partial<TripItem>): Promise<boolean> {
    // Read before the updater rather than inside it: nothing guarantees an
    // updater has run by the time the round-trip comes back, and a rollback
    // that quietly does nothing is worse than no rollback.
    const current = items.find((item) => item.id === id) ?? null;

    const before: Partial<TripItem> = {};
    if (current) {
      for (const key of Object.keys(patch) as (keyof TripItem)[]) {
        (before as Record<string, unknown>)[key] = current[key];
      }
    }

    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));

    const { data, error } = await supabase
      .from("trip_items")
      .update(patch)
      .eq("id", id)
      .select("id");

    if (error || (data?.length ?? 0) === 0) {
      warned();
      // Only what this patch changed: another change may have landed in
      // between, and putting the whole row back would take that with it.
      setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...before } : item)));
      Alert.alert("Couldn't save that", error?.message ?? "That isn't there any more.");
      return false;
    }

    return true;
  }

  async function deleteItem(item: TripItem) {
    setItems((prev) => prev.filter((row) => row.id !== item.id));

    const { error } = await supabase.from("trip_items").delete().eq("id", item.id);
    if (error) {
      warned();
      Alert.alert("Couldn't remove that", error.message);
      load();
      return;
    }

    // The row is gone, so nothing points at the picture any more.
    if (item.photo_path) await removePhoto(item.photo_path);
  }

  const menuItem = items.find((item) => item.id === menuFor) ?? null;

  function actionsFor(item: TripItem): SheetAction[] {
    return [
      {
        label: item.booked ? "Mark as not booked yet" : "Mark as booked",
        onPress: () => patchItem(item.id, { booked: !item.booked }),
      },
      {
        label: "Remove it",
        destructive: true,
        onPress: () =>
          Alert.alert(`Remove "${item.title}"?`, "It goes for both of you.", [
            { text: "Keep it", style: "cancel" },
            { text: "Remove", style: "destructive", onPress: () => deleteItem(item) },
          ]),
      },
    ];
  }

  if (!loaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  // Only when there is nothing to show. A refresh that failed while the trip
  // is on screen should leave it on screen -- replacing a trip somebody is
  // reading with an error because a background refresh timed out is the
  // screen throwing away what it already had.
  if (!trip) {
    return (
      <View style={styles.loading}>
        <Text style={styles.emptyText}>
          {readFailed ? "Couldn't read this trip just now." : "That trip isn't here any more."}
        </Text>
        <Pressable onPress={readFailed ? load : () => router.back()} hitSlop={8}>
          <Text style={styles.back}>{readFailed ? "Try again" : "‹ Back"}</Text>
        </Pressable>
        {readFailed ? (
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text style={styles.back}>‹ Back</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const nights = tripNights(trip);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: t.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
        }
      >
        <Pressable onPress={() => router.back()} hitSlop={10} style={press(styles.backTap)}>
          <Text style={styles.back}>‹ Wishlists &amp; Travel</Text>
        </Pressable>

        <PhotoTile
          path={trip.cover_path}
          kind="trip"
          ownerId={profile?.couple_id ?? null}
          onChange={(path) => patchTrip({ cover_path: path })}
          label="Add a photo of where you're going"
          height={180}
        />

        <TextInput
          style={styles.titleInput}
          value={trip.title}
          onChangeText={(next) => setTrip({ ...trip, title: next })}
          onBlur={() => patchTrip({ title: trip.title.trim() || "Trip" })}
          returnKeyType="done"
        />

        <View style={styles.destinationRow}>
          <TextInput
            style={[styles.destinationInput, { flex: 1 }]}
            value={trip.destination ?? ""}
            placeholder="Where exactly?"
            placeholderTextColor={t.textMuted}
            onChangeText={(next) => setTrip({ ...trip, destination: next })}
            onBlur={() => patchTrip({ destination: trip.destination?.trim() || null })}
            returnKeyType="done"
          />

          {/* The line between an idea and a plan. Nothing here can work it
              out -- flights paid for and nothing else is a booked trip, a
              hotel held on free cancellation is not -- so it is asked, and
              saying yes is what puts the countdown on your home screen. */}
          <View style={styles.bookedToggle}>
            <Text style={styles.bookedLabel}>Booked?</Text>
            <Switch
              value={trip.booked}
              onValueChange={(next) => {
                tapped();
                patchTrip({ booked: next });
              }}
              trackColor={{ true: t.accent, false: t.surfaceSunken }}
            />
          </View>
        </View>

        {trip.booked && !trip.start_date ? (
          <Text style={styles.bookedHint}>
            Add the date you leave and it starts counting down on Home.
          </Text>
        ) : null}

        <View style={styles.dates}>
          <View style={{ flex: 1 }}>
            <DateField
              label="From"
              value={trip.start_date}
              onChange={(iso) => patchTrip({ start_date: iso })}
              // Without this the database refuses it, and what reaches the
              // screen is the name of a check constraint.
              maximumDate={trip.end_date ? new Date(`${trip.end_date}T00:00:00`) : undefined}
            />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="To"
              value={trip.end_date}
              onChange={(iso) => patchTrip({ end_date: iso })}
              minimumDate={trip.start_date ? new Date(`${trip.start_date}T00:00:00`) : undefined}
            />
          </View>
        </View>

        <Text style={styles.when}>
          {tripWhen(trip)}
          {nights === null ? "" : ` · ${nights} night${nights === 1 ? "" : "s"}`}
        </Text>

        {SECTIONS.map((section) => {
          const rows = items.filter((item) => item.kind === section.kind).sort(byWhen);

          return (
            <View key={section.kind} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>

              {rows.length === 0 ? (
                <Text style={styles.sectionBlurb}>{section.blurb}</Text>
              ) : (
                rows.map((item) => (
                  <SwipeRow
                    key={item.id}
                    actionLabel="Remove"
                    onAction={() =>
                      Alert.alert(`Remove "${item.title}"?`, "It goes for both of you.", [
                        { text: "Keep it", style: "cancel" },
                        { text: "Remove", style: "destructive", onPress: () => deleteItem(item) },
                      ])
                    }
                  >
                  <View style={styles.item}>
                    <Pressable
                      style={styles.itemHead}
                      onPress={() => {
                        setMenuFor(item.id);
                        setMenuOpen(true);
                      }}
                    >
                      {/* Only the pip toggles it. Marking a flight booked
                          for both of you should take aim, not a thumb that
                          landed on the row while scrolling. */}
                      <Pressable
                        onPress={() => patchItem(item.id, { booked: !item.booked })}
                        // Padding rather than hitSlop: Android will not hit-test
                        // a child outside its parent's bounds, so slop hanging
                        // off the left edge of the row is dead space.
                        style={styles.pipTap}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: item.booked }}
                        accessibilityLabel={item.booked ? "Booked" : "Not booked yet"}
                      >
                        <View style={[styles.pip, item.booked ? styles.pipBooked : null]} />
                      </Pressable>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.title}</Text>
                        <Text style={styles.itemMeta}>
                          {item.booked ? "Booked" : "Not booked yet"}
                        </Text>
                      </View>
                    </Pressable>

                    {/* The screenshot. Most of what is in a trip before it is
                        booked only exists as one. */}
                    <PhotoTile
                      path={item.photo_path}
                      kind="document"
                      ownerId={profile?.couple_id ?? null}
                      onChange={(path) => patchItem(item.id, { photo_path: path })}
                      label="Add a screenshot or photo"
                      height={item.photo_path ? 200 : 54}
                    />
                  </View>
                  </SwipeRow>
                ))
              )}

              {draftFor === section.kind ? (
                <View>
                <View style={styles.draftRow}>
                  <TextInput
                    style={styles.draftInput}
                    value={draftTitle}
                    onChangeText={setDraftTitle}
                    placeholder={section.add}
                    placeholderTextColor={t.textMuted}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={() => addItem(section.kind)}
                  />
                  <Pressable style={press(styles.draftAdd)} onPress={() => addItem(section.kind)}>
                    <Text style={styles.draftAddText}>Add</Text>
                  </Pressable>
                </View>
                <Text style={styles.draftHint}>{ADD_HINT}</Text>
                </View>
              ) : (
                <Pressable
                  style={press(styles.addRow)}
                  onPress={() => {
                    tapped();
                    setDraftTitle("");
                    setDraftFor(section.kind);
                  }}
                >
                  <Text style={styles.addRowText}>+ {section.add}</Text>
                </Pressable>
              )}
            </View>
          );
        })}

        <Text style={styles.sectionTitle}>Anything else</Text>
        <TextInput
          style={styles.notes}
          value={trip.notes ?? ""}
          placeholder="Things worth remembering about this one."
          placeholderTextColor={t.textMuted}
          multiline
          onChangeText={(next) => setTrip({ ...trip, notes: next })}
          onBlur={() => patchTrip({ notes: trip.notes?.trim() || null })}
        />

        <Text style={styles.footnote}>
          Tap the circle to mark it booked · tap a photo to change it · swipe to remove
        </Text>
      </ScrollView>

      <ActionSheet
        visible={menuOpen && Boolean(menuItem)}
        title={menuItem?.title ?? ""}
        subtitle={menuItem ? (menuItem.booked ? "Booked" : "Not booked yet") : null}
        actions={menuItem ? actionsFor(menuItem) : []}
        onClose={() => setMenuOpen(false)}
        onDismissed={() => setMenuFor(null)}
      />
    </KeyboardAvoidingView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg, gap: t.space(4) },
    container: { padding: t.space(5), paddingTop: t.space(14), paddingBottom: t.space(12) },
    backTap: { alignSelf: "flex-start", paddingVertical: t.space(1), marginBottom: t.space(3) },
    back: { ...t.type.label, color: t.accent },
    titleInput: {
      ...t.type.display,
      color: t.textPrimary,
      marginTop: t.space(5),
      paddingVertical: 0,
    },
    destinationRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: t.space(4),
      marginTop: t.space(2),
    },
    destinationInput: { ...t.type.body, color: t.textSecondary },
    bookedToggle: { flexDirection: "row", alignItems: "center", gap: t.space(2) },
    bookedLabel: { ...t.type.label, color: t.textSecondary },
    bookedHint: { ...t.type.caption, color: t.textMuted, marginTop: t.space(2) },
    dates: { flexDirection: "row", gap: t.space(4), marginTop: t.space(4) },
    when: { ...t.type.caption, color: t.textMuted, marginTop: t.space(1) },
    section: { marginTop: t.space(8) },
    sectionTitle: { ...t.type.title, color: t.textPrimary, marginBottom: t.space(2) },
    sectionBlurb: { ...t.type.caption, color: t.textMuted, marginBottom: t.space(2) },
    item: { ...t.card, padding: t.space(4), marginBottom: t.space(3), gap: t.space(3) },
    itemHead: { flexDirection: "row", alignItems: "center" },
    // Negative margin so the bigger target does not push the row about.
    pipTap: { padding: t.space(3), margin: -t.space(1) },
    pip: {
      width: 10,
      height: 10,
      borderRadius: 5,
      borderWidth: 2,
      borderColor: t.textMuted,
    },
    pipBooked: { backgroundColor: t.accent, borderColor: t.accent },
    itemTitle: { ...t.type.heading, color: t.textPrimary },
    itemMeta: { ...t.type.caption, color: t.textMuted, marginTop: 2 },
    addRow: { paddingVertical: t.space(3) },
    addRowText: { ...t.type.label, color: t.accent },
    draftRow: { flexDirection: "row", gap: t.space(2), marginTop: t.space(2) },
    draftInput: {
      flex: 1,
      backgroundColor: t.surface,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space(4),
      paddingVertical: t.space(3),
      ...t.type.body,
      color: t.textPrimary,
    },
    draftAdd: {
      backgroundColor: t.brand,
      borderRadius: t.radius.pill,
      paddingHorizontal: t.space(5),
      justifyContent: "center",
    },
    draftAddText: { ...t.type.label, color: t.textOnBrand },
    draftHint: { ...t.type.caption, color: t.textSecondary, marginTop: t.space(2) },
    notes: {
      ...t.card,
      padding: t.space(4),
      minHeight: 96,
      textAlignVertical: "top",
      ...t.type.body,
      color: t.textPrimary,
    },
    emptyText: { ...t.type.body, color: t.textSecondary },
    footnote: { ...t.type.caption, color: t.textMuted, textAlign: "center", marginTop: t.space(8) },
  });
