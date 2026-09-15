import { useCallback, useState } from "react";
import {
  Alert,
  RefreshControl,
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import { press } from "@/components/press";
import { warned } from "@/lib/haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { Image } from "expo-image";
import { removePhoto, removePhotos, signedUrls } from "@/lib/photos";
import { Trip, byStartDate, isPast, tripWhen } from "@/lib/trips";
import { ActionSheet, type SheetAction } from "@/components/action-sheet";

type Wishlist = { id: string; name: string; item_count: number; cover_path: string | null };

export default function Wishlists() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { profile } = useAuth();
  const { partner } = useCoupleMembers();

  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const [tripModal, setTripModal] = useState(false);
  const [tripTitle, setTripTitle] = useState("");

  // Which trip's menu is open, and whether the sheet is still on screen. Two
  // pieces, because a sheet takes a moment to slide away and has to keep
  // saying what it is about while it does.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // An empty list and a list nobody has read yet look identical, and the
  // one that gets shown on every cold open is the wrong one: somebody with
  // eleven of these should never be told they have none.
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [listRes, tripRes] = await Promise.all([
      supabase
        .from("wishlists")
        .select("id, name, cover_path, wishlist_items(count)")
        .order("created_at", { ascending: true }),
      supabase
        .from("trips")
        .select("id, title, destination, start_date, end_date, notes, cover_path"),
    ]);

    // A read that failed is not a list with nothing in it. Marking it loaded
    // would put "you have none of these" in front of somebody who has
    // eleven, which is the sentence this flag was added to prevent.
    if (listRes.error || tripRes.error) return;

    const lists: Wishlist[] = (listRes.data ?? []).map((w: any) => ({
      id: w.id,
      name: w.name,
      cover_path: (w.cover_path as string | null) ?? null,
      item_count: w.wishlist_items?.[0]?.count ?? 0,
    }));

    const tripRows = (tripRes.data as Trip[]) ?? [];

    setWishlists(lists);
    setTrips(tripRows);
    setLoaded(true);

    // One request for every picture on the screen rather than one each.
    setThumbs(
      await signedUrls([
        ...lists.map((l) => l.cover_path),
        ...tripRows.map((trip) => trip.cover_path),
      ])
    );
  }, []);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  // What is coming, and what has been. A trip that has happened is worth
  // keeping -- it is where the photographs and the notes ended up -- but it
  // is not what the screen is for.
  const upcomingTrips = trips.filter((trip) => !isPast(trip)).sort(byStartDate);
  const pastTrips = trips.filter((trip) => isPast(trip)).sort(byStartDate).reverse();

  const menuTrip = trips.find((trip) => trip.id === menuFor) ?? null;

  async function createWishlist() {
    if (!name.trim() || !profile?.couple_id) return;
    setSaving(true);
    const { error } = await supabase.from("wishlists").insert({
      couple_id: profile.couple_id,
      created_by: profile.id,
      name: name.trim(),
    });
    setSaving(false);

    if (error) {
      warned();
      Alert.alert("Couldn't create that", error.message);
      return;
    }

    setName("");
    setModalVisible(false);
    load();
  }

  /**
   * The three lists every couple turns out to want, once, on an empty
   * screen.
   *
   * Offered rather than assumed: they appear the first time somebody opens
   * this with nothing on it, and the couple is flagged so that deleting all
   * three does not bring them back tomorrow. The names are built here
   * because one of them has a person's name in it, and the database has no
   * business knowing that.
   */
  async function seedDefaults() {
    const names = [
      partner?.display_name ? `Gifts for ${partner.display_name}` : "Gift ideas",
      "Christmas",
      "Kids",
    ];

    const { error } = await supabase.rpc("seed_default_wishlists", { names });

    if (error) {
      warned();
      Alert.alert("Couldn't set those up", error.message);
      return;
    }

    load();
  }

  async function createTrip() {
    if (!tripTitle.trim() || !profile?.couple_id) return;

    setSaving(true);
    const { data, error } = await supabase
      .from("trips")
      .insert({
        couple_id: profile.couple_id,
        created_by: profile.id,
        title: tripTitle.trim(),
      })
      .select("id")
      .single();
    setSaving(false);

    if (error) {
      warned();
      Alert.alert("Couldn't start that trip", error.message);
      return;
    }

    setTripTitle("");
    setTripModal(false);
    load();

    // Straight into it: a trip with only a name is not the point, and the
    // dates, the photo and everything else live one screen in.
    if (data?.id) router.push(`/trip?id=${data.id}`);
  }

  async function deleteTrip(tripId: string) {
    const cover = trips.find((trip) => trip.id === tripId)?.cover_path ?? null;

    // Read before the row goes: the screenshots hang off trip_items, which
    // the cascade takes with the trip, and after that nothing knows the
    // paths -- leaving somebody's boarding passes on a server forever.
    const { data: shots } = await supabase
      .from("trip_items")
      .select("photo_path")
      .eq("trip_id", tripId);

    setTrips((prev) => prev.filter((trip) => trip.id !== tripId));

    const { error } = await supabase.from("trips").delete().eq("id", tripId);
    if (error) {
      warned();
      Alert.alert("Couldn't delete that", error.message);
      load();
      return;
    }

    await removePhotos([cover, ...(shots ?? []).map((row) => row.photo_path as string | null)]);
  }

  async function renameWishlist() {
    const listId = renamingId;
    const next = renameDraft.trim();
    if (!listId || !next) {
      setRenamingId(null);
      return;
    }

    setWishlists((prev) => prev.map((w) => (w.id === listId ? { ...w, name: next } : w)));
    setRenamingId(null);

    const { error } = await supabase.from("wishlists").update({ name: next }).eq("id", listId);
    if (error) {
      warned();
      Alert.alert("Couldn't rename that", error.message);
      load();
    }
  }

  async function deleteWishlist(listId: string) {
    const cover = wishlists.find((w) => w.id === listId)?.cover_path ?? null;

    setWishlists((prev) => prev.filter((w) => w.id !== listId));
    const { error } = await supabase.from("wishlists").delete().eq("id", listId);
    if (error) {
      warned();
      Alert.alert("Couldn't delete that", error.message);
      load();
      return;
    }

    await removePhoto(cover);
  }

  function listActions(list: Wishlist) {
    Alert.alert(list.name, undefined, [
      {
        text: "Rename",
        onPress: () => {
          setRenamingId(list.id);
          setRenameDraft(list.name);
        },
      },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Delete this list?",
            list.item_count > 0
              ? `"${list.name}" and its ${list.item_count} ${list.item_count === 1 ? "item" : "items"} will be gone for both of you.`
              : `"${list.name}" will be gone for both of you.`,
            [
              { text: "Keep it", style: "cancel" },
              { text: "Delete", style: "destructive", onPress: () => deleteWishlist(list.id) },
            ]
          ),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
      <Text style={styles.title}>Wishlists &amp; Travel</Text>

      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Wishlists</Text>
        <Pressable onPress={() => setModalVisible(true)} hitSlop={8}>
          <Text style={styles.addLink}>+ New</Text>
        </Pressable>
      </View>

      {loaded && wishlists.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Nothing on any list yet</Text>
          <Text style={styles.emptyText}>
            Somewhere to put the things either of you mentions wanting, months before anybody has
            to think about a present.
          </Text>
          <Pressable style={press(styles.emptyButton)} onPress={seedDefaults}>
            <Text style={styles.emptyButtonText}>
              Start me off{partner?.display_name ? "" : " with three"}
            </Text>
          </Pressable>
        </View>
      ) : (
        wishlists.map((w) =>
          renamingId === w.id ? (
            <View key={w.id} style={styles.card}>
              <TextInput
                style={styles.renameInput}
                value={renameDraft}
                onChangeText={setRenameDraft}
                onSubmitEditing={renameWishlist}
                autoFocus
                returnKeyType="done"
              />
              <View style={styles.renameActions}>
                <Pressable onPress={() => setRenamingId(null)} hitSlop={8}>
                  <Text style={styles.renameCancel}>Cancel</Text>
                </Pressable>
                <Pressable onPress={renameWishlist} hitSlop={8}>
                  <Text style={styles.renameSave}>Save</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable
              key={w.id}
              style={press(styles.card)}
              onPress={() => router.push(`/wishlists/${w.id}?name=${encodeURIComponent(w.name)}`)}
              onLongPress={() => listActions(w)}
            >
              {/* The picture, where there is one. "Camping gear" tells you
                  less at a glance than a photograph of the tent. */}
              {w.cover_path && thumbs[w.cover_path] ? (
                <Image
                  source={{ uri: thumbs[w.cover_path] }}
                  alt={w.name}
                  style={styles.thumb}
                  contentFit="cover"
                  transition={200}
                />
              ) : null}

              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{w.name}</Text>
                <Text style={styles.cardCount}>
                  {w.item_count} item{w.item_count === 1 ? "" : "s"}
                </Text>
              </View>
            </Pressable>
          )
        )
      )}

      {wishlists.length > 0 ? (
        <Text style={styles.hint}>Hold a list to rename or delete it</Text>
      ) : null}

      <View style={[styles.headerRow, styles.travelHeader]}>
        <Text style={styles.sectionTitle}>Travel</Text>
        <Pressable onPress={() => setTripModal(true)} hitSlop={8}>
          <Text style={styles.addLink}>+ Trip</Text>
        </Pressable>
      </View>

      {loaded && trips.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyText}>
            Start one the moment you say the word out loud, not when it is booked. Flights,
            where you are staying, the things you both said you wanted to do -- and the
            screenshots, which is where most of it starts.
          </Text>
        </View>
      ) : null}

      {upcomingTrips.map((trip) => (
        <Pressable
          key={trip.id}
          style={press(styles.tripCard)}
          onPress={() => router.push(`/trip?id=${trip.id}`)}
          onLongPress={() => {
            setMenuFor(trip.id);
            setMenuOpen(true);
          }}
        >
          {trip.cover_path && thumbs[trip.cover_path] ? (
            <Image
              source={{ uri: thumbs[trip.cover_path] }}
              alt={trip.title}
              style={styles.tripImage}
              contentFit="cover"
              transition={200}
            />
          ) : null}

          <View style={styles.tripBody}>
            <Text style={styles.cardTitle}>{trip.title}</Text>
            <Text style={styles.cardCount}>
              {trip.destination ? `${trip.destination} · ` : ""}
              {tripWhen(trip)}
            </Text>
          </View>
        </Pressable>
      ))}

      {pastTrips.length > 0 ? (
        <>
          <Text style={styles.pastTitle}>Been and gone</Text>
          {pastTrips.map((trip) => (
            <Pressable
              key={trip.id}
              style={press([styles.tripCard, styles.tripPast])}
              onPress={() => router.push(`/trip?id=${trip.id}`)}
              onLongPress={() => {
                setMenuFor(trip.id);
                setMenuOpen(true);
              }}
            >
              <View style={styles.tripBody}>
                <Text style={styles.cardTitle}>{trip.title}</Text>
                <Text style={styles.cardCount}>{tripWhen(trip)}</Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}

      <ActionSheet
        visible={menuOpen && Boolean(menuTrip)}
        title={menuTrip?.title ?? ""}
        subtitle={menuTrip ? tripWhen(menuTrip) : null}
        actions={
          menuTrip
            ? ([
                { label: "Open it", onPress: () => router.push(`/trip?id=${menuTrip.id}`) },
                {
                  label: "Delete this trip",
                  destructive: true,
                  onPress: () =>
                    Alert.alert(
                      `Delete "${menuTrip.title}"?`,
                      "Everything in it goes with it, for both of you.",
                      [
                        { text: "Keep it", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => deleteTrip(menuTrip.id),
                        },
                      ]
                    ),
                },
              ] as SheetAction[])
            : []
        }
        onClose={() => setMenuOpen(false)}
        onDismissed={() => setMenuFor(null)}
      />

      <Modal visible={tripModal} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Where to?</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Japan"
              placeholderTextColor={t.textMuted}
              value={tripTitle}
              onChangeText={setTripTitle}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={createTrip}
            />
            <Text style={styles.modalHint}>
              Dates, photos and everything else come next. None of it has to be booked.
            </Text>
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable
                style={press([styles.button, { flex: 1, backgroundColor: t.border }])}
                onPress={() => {
                  setTripTitle("");
                  setTripModal(false);
                }}
              >
                <Text style={[styles.buttonText, { color: t.textPrimary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={press([styles.button, { flex: 1 }])}
                onPress={createTrip}
                disabled={saving}
              >
                <Text style={styles.buttonText}>{saving ? "Saving..." : "Start it"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New wishlist</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Date Ideas"
        placeholderTextColor={t.textMuted}
              value={name}
              onChangeText={setName}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable
                style={press([styles.button, { flex: 1, backgroundColor: t.border }])}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.buttonText, { color: t.textPrimary }]}>Cancel</Text>
              </Pressable>
              <Pressable style={press([styles.button, { flex: 1 }])} onPress={createWishlist} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? "Saving..." : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { ...t.type.display, color: t.textPrimary, marginBottom: t.space(5) },
  sectionTitle: { ...t.type.title, color: t.textPrimary },
  travelHeader: { marginTop: t.space(9) },
  addLink: { ...t.type.heading, color: t.accent },
  emptyCard: { ...t.card, padding: t.space(5), marginBottom: 12 },
  emptyTitle: { ...t.type.heading, color: t.textPrimary, marginBottom: t.space(2) },
  emptyText: { ...t.type.caption, color: t.textSecondary },
  emptyButton: {
    alignSelf: "flex-start",
    marginTop: t.space(4),
    paddingHorizontal: t.space(4),
    paddingVertical: t.space(3),
    borderRadius: t.radius.pill,
    backgroundColor: t.accentSoft,
  },
  emptyButtonText: { ...t.type.label, color: t.accent },
  card: {
    ...t.card,
    padding: t.space(5),
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: t.space(4),
  },
  thumb: { width: 56, height: 56, borderRadius: t.radius.md },
  // A trip is the one thing here that deserves a picture across the whole
  // card: it is the thing people open the app to look forward to.
  tripCard: { ...t.card, marginBottom: 12, overflow: "hidden" },
  tripImage: { width: "100%", height: 132 },
  tripBody: { padding: t.space(5) },
  tripPast: { opacity: 0.6 },
  pastTitle: { ...t.type.eyebrow, color: t.textMuted, marginTop: t.space(4), marginBottom: t.space(3) },
  renameInput: {
    fontSize: 16,
    fontWeight: "600",
    color: t.textPrimary,
    backgroundColor: t.surfaceSunken,
    borderRadius: t.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  renameActions: { flexDirection: "row", justifyContent: "flex-end", gap: 18, marginTop: 10 },
  renameCancel: { ...t.type.body, color: t.textMuted },
  renameSave: { ...t.type.body, color: t.accent, fontWeight: "700" },
  hint: { ...t.type.caption, color: t.textMuted, textAlign: "center", marginTop: 4 },
  cardTitle: { ...t.type.title, color: t.textPrimary, marginBottom: 4 },
  cardCount: { ...t.type.caption, color: t.textMuted },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCard: { ...t.card, padding: t.space(5) },
  modalTitle: { ...t.type.title, marginBottom: 16, color: t.textPrimary },
  modalHint: { ...t.type.caption, color: t.textMuted, marginTop: t.space(3) },
  input: {
    backgroundColor: t.bg,
    borderRadius: t.radius.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    ...t.type.body,
    color: t.textPrimary,
  },
  button: { backgroundColor: t.accent, borderRadius: t.radius.pill, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: t.textOnBrand, ...t.type.heading },
  });
