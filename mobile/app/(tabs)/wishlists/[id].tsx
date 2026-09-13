import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

type Item = { id: string; title: string; url: string | null };

export default function WishlistDetail() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const { profile } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    const { data } = await supabase
      .from("wishlist_items")
      .select("id, title, url")
      .eq("wishlist_id", id)
      .order("created_at", { ascending: true });
    if (data) setItems(data as Item[]);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

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
    await supabase.from("wishlist_items").delete().eq("id", itemId);
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#F7F5F0" }}>
      <ScrollView contentContainerStyle={styles.container}>
        <Pressable onPress={() => router.back()} style={{ marginBottom: 16 }}>
          <Text style={styles.back}>{"‹ Wishlists"}</Text>
        </Pressable>
        <Text style={styles.title}>{name ?? "Wishlist"}</Text>

        {items.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No items yet.</Text>
          </View>
        ) : (
          items.map((item) => (
            <Pressable key={item.id} style={styles.itemRow} onLongPress={() => removeItem(item.id)}>
              <Text style={styles.itemText}>{item.title}</Text>
            </Pressable>
          ))
        )}
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
        <Pressable style={styles.addButton} onPress={addItem}>
          <Text style={styles.addButtonText}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 16 },
  back: { fontSize: 14, color: "#1D9E75", fontWeight: "600" },
  title: { fontSize: 26, fontWeight: "600", color: "#14140F", marginBottom: 20 },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  emptyText: { fontSize: 13, color: "#6B6B6B" },
  itemRow: { backgroundColor: "#fff", borderRadius: 12, padding: 14, marginBottom: 8 },
  itemText: { fontSize: 14, color: "#14140F" },
  addBar: {
    flexDirection: "row",
    gap: 8,
    padding: 16,
    backgroundColor: "#F7F5F0",
    borderTopWidth: 1,
    borderTopColor: "#E9E7E0",
  },
  addInput: {
    flex: 1,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 14,
  },
  addButton: {
    backgroundColor: "#D85A30",
    borderRadius: 999,
    paddingHorizontal: 20,
    justifyContent: "center",
  },
  addButtonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
