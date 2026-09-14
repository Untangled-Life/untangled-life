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

type Wishlist = { id: string; name: string; item_count: number };

export default function Wishlists() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { profile } = useAuth();
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("wishlists")
      .select("id, name, wishlist_items(count)")
      .order("created_at", { ascending: true });

    if (data) {
      setWishlists(
        data.map((w: any) => ({
          id: w.id,
          name: w.name,
          item_count: w.wishlist_items?.[0]?.count ?? 0,
        }))
      );
    }
  }, []);

  // Refreshes whenever this screen comes back into view, not just on
  // mount -- otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function createWishlist() {
    if (!name.trim() || !profile?.couple_id) return;
    setSaving(true);
    const { error } = await supabase.from("wishlists").insert({
      couple_id: profile.couple_id,
      created_by: profile.id,
      name: name.trim(),
    });
    setSaving(false);
    if (!error) {
      setName("");
      setModalVisible(false);
      load();
    }
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
    setWishlists((prev) => prev.filter((w) => w.id !== listId));
    const { error } = await supabase.from("wishlists").delete().eq("id", listId);
    if (error) {
      warned();
      Alert.alert("Couldn't delete that", error.message);
      load();
    }
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
      <View style={styles.headerRow}>
        <Text style={styles.title}>Wishlists</Text>
        <Pressable onPress={() => setModalVisible(true)}>
          <Text style={styles.addLink}>+ New</Text>
        </Pressable>
      </View>

      {wishlists.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No wishlists yet. Start one for gift ideas, date ideas, or travel.
          </Text>
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
              <Text style={styles.cardTitle}>{w.name}</Text>
              <Text style={styles.cardCount}>
                {w.item_count} item{w.item_count === 1 ? "" : "s"}
              </Text>
            </Pressable>
          )
        )
      )}

      {wishlists.length > 0 ? (
        <Text style={styles.hint}>Hold a list to rename or delete it</Text>
      ) : null}

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
  title: { ...t.type.display, color: t.textPrimary },
  addLink: { ...t.type.heading, color: t.accent },
  emptyCard: { ...t.card, padding: t.space(5) },
  emptyText: { ...t.type.caption, color: t.textSecondary },
  card: { ...t.card, padding: t.space(5), marginBottom: 12 },
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
