import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Modal } from "react-native";
import { router } from "expo-router";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

type Wishlist = { id: string; name: string; item_count: number };

export default function Wishlists() {
  const { profile } = useAuth();
  const [wishlists, setWishlists] = useState<Wishlist[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    load();
  }, [load]);

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

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Wishlists</Text>
        <Pressable onPress={() => setModalVisible(true)}>
          <Text style={styles.addLink}>+ New</Text>
        </Pressable>
      </View>

      {wishlists.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No wishlists yet — start one for gift ideas, date ideas, or travel.
          </Text>
        </View>
      ) : (
        wishlists.map((w) => (
          <Pressable
            key={w.id}
            style={styles.card}
            onPress={() => router.push(`/wishlists/${w.id}?name=${encodeURIComponent(w.name)}`)}
          >
            <Text style={styles.cardTitle}>{w.name}</Text>
            <Text style={styles.cardCount}>{w.item_count} item{w.item_count === 1 ? "" : "s"}</Text>
          </Pressable>
        ))
      )}

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New wishlist</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Date Ideas"
              value={name}
              onChangeText={setName}
            />
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable
                style={[styles.button, { flex: 1, backgroundColor: "#E9E7E0" }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.buttonText, { color: "#14140F" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={createWishlist} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? "Saving..." : "Create"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  title: { fontSize: 26, fontWeight: "600", color: "#14140F" },
  addLink: { fontSize: 14, fontWeight: "600", color: "#1D9E75" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  emptyText: { fontSize: 13, color: "#6B6B6B", lineHeight: 18 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 12 },
  cardTitle: { fontSize: 16, fontWeight: "600", color: "#14140F", marginBottom: 4 },
  cardCount: { fontSize: 13, color: "#9A9A9A" },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 16, color: "#14140F" },
  input: {
    backgroundColor: "#F7F5F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  button: { backgroundColor: "#1D9E75", borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
});
