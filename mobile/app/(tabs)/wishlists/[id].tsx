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
  Linking,
} from "react-native";
import { press } from "@/components/press";
import { warned } from "@/lib/haptics";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

type Item = { id: string; title: string; url: string | null };

export default function WishlistDetail() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { profile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftUrl, setDraftUrl] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("wishlist_items")
      .select("id, title, url")
      .eq("wishlist_id", id)
      .order("created_at", { ascending: true });
    if (data) setItems(data as Item[]);
  }, [id]);

  // Refreshes whenever this screen comes back into view, not just on
  // mount — otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function addItem() {
    if (!title.trim() || !id || !profile?.couple_id) return;
    const { error } = await supabase.from("wishlist_items").insert({
      couple_id: profile.couple_id,
      wishlist_id: id,
      added_by: profile.id,
      title: title.trim(),
    });
    if (!error) {
      setTitle("");
      load();
    }
  }

  async function removeItem(itemId: string) {
    setItems((prev) => prev.filter((i) => i.id !== itemId));
    const { error } = await supabase.from("wishlist_items").delete().eq("id", itemId);
    if (error) {
      warned();
      Alert.alert("Couldn't remove that", error.message);
      load();
    }
  }

  function startEdit(item: Item) {
    setEditingId(item.id);
    setDraftTitle(item.title);
    setDraftUrl(item.url ?? "");
  }

  async function saveEdit() {
    const itemId = editingId;
    if (!itemId) return;

    const nextTitle = draftTitle.trim();
    if (!nextTitle) {
      setEditingId(null);
      return;
    }

    const nextUrl = draftUrl.trim() || null;
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, title: nextTitle, url: nextUrl } : i))
    );
    setEditingId(null);

    const { error } = await supabase
      .from("wishlist_items")
      .update({ title: nextTitle, url: nextUrl })
      .eq("id", itemId);

    if (error) {
      warned();
      Alert.alert("Couldn't save that", error.message);
      load();
    }
  }

  function itemActions(item: Item) {
    Alert.alert(item.title, undefined, [
      { text: "Edit", onPress: () => startEdit(item) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => removeItem(item.id),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  function openLink(url: string) {
    const full = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    Linking.openURL(full).catch(() =>
      Alert.alert("Couldn't open that", "That link doesn't look like a web address.")
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={press({ marginBottom: 16 })}>
          <Text style={styles.back}>{"‹ Wishlists"}</Text>
        </Pressable>
        <Text style={styles.title}>{name ?? "Wishlist"}</Text>

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No items yet.</Text>
          </View>
        ) : (
          items.map((item) =>
            editingId === item.id ? (
              <View key={item.id} style={styles.itemRow}>
                <TextInput
                  style={styles.editInput}
                  value={draftTitle}
                  onChangeText={setDraftTitle}
                  placeholder="What is it?"
                  placeholderTextColor={t.textMuted}
                  autoFocus
                  returnKeyType="next"
                />
                <TextInput
                  style={[styles.editInput, styles.editInputLink]}
                  value={draftUrl}
                  onChangeText={setDraftUrl}
                  placeholder="Link (optional)"
                  placeholderTextColor={t.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                  onSubmitEditing={saveEdit}
                  returnKeyType="done"
                />
                <View style={styles.editActions}>
                  <Pressable onPress={() => setEditingId(null)} hitSlop={8}>
                    <Text style={styles.editCancel}>Cancel</Text>
                  </Pressable>
                  <Pressable onPress={saveEdit} hitSlop={8}>
                    <Text style={styles.editSave}>Save</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                key={item.id}
                style={press(styles.itemRow)}
                onPress={() => startEdit(item)}
                onLongPress={() => itemActions(item)}
              >
                <Text style={styles.itemText}>{item.title}</Text>
                {item.url ? (
                  <Pressable onPress={() => openLink(item.url as string)} hitSlop={6}>
                    <Text style={styles.itemLink} numberOfLines={1}>
                      {item.url}
                    </Text>
                  </Pressable>
                ) : null}
              </Pressable>
            )
          )
        )}

        {items.length > 0 ? (
          <Text style={styles.hint}>Tap an item to edit or add a link · hold for more</Text>
        ) : null}
      </ScrollView>

      <View style={styles.addBar}>
        <TextInput
          style={styles.addInput}
          placeholder="Add an item..."
          value={title}
          onChangeText={setTitle}
          onSubmitEditing={addItem}
          returnKeyType="done"
        />
        <Pressable style={press(styles.addButton)} onPress={addItem}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 16 },
  back: { fontSize: 14, color: t.accent, fontWeight: "600" },
  title: { fontSize: 26, fontWeight: "600", color: t.textPrimary, marginBottom: 20 },
  emptyCard: { backgroundColor: t.surface, borderRadius: t.radius.lg, padding: 20 },
  emptyText: { fontSize: 13, color: t.textSecondary },
  itemRow: { backgroundColor: t.surface, borderRadius: t.radius.md, padding: 14, marginBottom: 8 },
  editInput: {
    fontSize: 15,
    color: t.textPrimary,
    backgroundColor: t.surfaceSunken,
    borderRadius: t.radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  editInputLink: { fontSize: 13 },
  editActions: { flexDirection: "row", justifyContent: "flex-end", gap: 18, paddingTop: 2 },
  editCancel: { fontSize: 14, color: t.textMuted },
  editSave: { fontSize: 14, color: t.accent, fontWeight: "700" },
  itemLink: { fontSize: 12, color: t.accent, marginTop: 4 },
  hint: { fontSize: 12, color: t.textMuted, textAlign: "center", marginTop: 4 },
  itemText: { fontSize: 14, color: t.textPrimary },
  addBar: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    backgroundColor: t.bg,
    borderTopWidth: 1,
    borderTopColor: t.border,
  },
  addInput: {
    flex: 1,
    backgroundColor: t.surface,
    borderRadius: t.radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
    color: t.textPrimary,
  },
  addButton: {
    backgroundColor: t.brand,
    borderRadius: t.radius.pill,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  addButtonText: { color: t.surface, fontWeight: "600", fontSize: 14 },
  });
