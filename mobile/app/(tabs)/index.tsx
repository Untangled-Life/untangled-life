import { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  TextInput,
  Modal,
} from "react-native";
import * as Calendar from "expo-calendar";
import { PermissionStatus } from "expo";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";

type KeyDate = {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  recurring: boolean;
};

function daysUntil(dateStr: string, recurring: boolean): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + "T00:00:00");

  if (recurring) {
    target.setFullYear(today.getFullYear());
    if (target < today) {
      target.setFullYear(today.getFullYear() + 1);
    }
  }

  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Home() {
  const { profile, signOut } = useAuth();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [calendarCount, setCalendarCount] = useState<number | null>(null);
  const [keyDates, setKeyDates] = useState<KeyDate[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(""); // YYYY-MM-DD
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadKeyDates = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring")
      .order("date", { ascending: true });
    if (data) setKeyDates(data as KeyDate[]);
  }, []);

  useEffect(() => {
    Calendar.getCalendarPermissions().then((result) => setPermission(result.status));
    loadKeyDates();
  }, [loadKeyDates]);

  async function requestAccess() {
    const result = await Calendar.requestCalendarPermissions();
    setPermission(result.status);
    if (result.status === PermissionStatus.GRANTED) {
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      setCalendarCount(calendars.length);
    }
  }

  async function handleAddKeyDate() {
    if (!newTitle.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setError("Enter a title and a date as YYYY-MM-DD.");
      return;
    }
    if (!profile?.couple_id) return;

    setSaving(true);
    setError(null);
    const { error: insertError } = await supabase.from("key_dates").insert({
      couple_id: profile.couple_id,
      title: newTitle.trim(),
      date: newDate,
      recurring: true,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    setNewTitle("");
    setNewDate("");
    setModalVisible(false);
    loadKeyDates();
  }

  const upcoming = [...keyDates].sort(
    (a, b) => daysUntil(a.date, a.recurring) - daysUntil(b.date, a.recurring)
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>You&apos;re in</Text>
      <Text style={styles.subtitle}>
        You&apos;re paired up. Here&apos;s what&apos;s coming up together.
      </Text>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Key dates &amp; countdowns</Text>
        <Pressable onPress={() => setModalVisible(true)}>
          <Text style={styles.sectionAction}>+ Add</Text>
        </Pressable>
      </View>

      {upcoming.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No key dates yet — add a birthday or anniversary to start a countdown.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {upcoming.map((kd) => {
            const days = daysUntil(kd.date, kd.recurring);
            return (
              <View key={kd.id} style={styles.keyDateCard}>
                <Text style={styles.keyDateDays}>
                  {days === 0 ? "Today" : days === 1 ? "1 day" : `${days} days`}
                </Text>
                <Text style={styles.keyDateTitle} numberOfLines={2}>
                  {kd.title}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Calendar access</Text>
        <Text style={styles.cardBody}>
          {permission === PermissionStatus.GRANTED
            ? `Connected — reading ${calendarCount ?? "your"} calendar(s) on this phone (Google, iCloud, Outlook — whatever you've got synced).`
            : "Not connected yet. We read the calendars already synced to your phone, so this covers Google and Apple/iCloud without a separate sign-in for each."}
        </Text>
        {permission !== PermissionStatus.GRANTED ? (
          <Pressable style={styles.button} onPress={requestAccess}>
            <Text style={styles.buttonText}>Connect my calendar</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable onPress={() => signOut()} style={{ marginTop: 32 }}>
        <Text style={styles.link}>Signed in as {profile?.display_name ?? "you"}. Sign out</Text>
      </Pressable>

      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a key date</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Anniversary"
              value={newTitle}
              onChangeText={setNewTitle}
            />
            <TextInput
              style={styles.input}
              placeholder="YYYY-MM-DD"
              value={newDate}
              onChangeText={setNewDate}
              keyboardType="numbers-and-punctuation"
            />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
              <Pressable
                style={[styles.button, { flex: 1, backgroundColor: "#E9E7E0" }]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={[styles.buttonText, { color: "#14140F" }]}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.button, { flex: 1 }]} onPress={handleAddKeyDate} disabled={saving}>
                <Text style={styles.buttonText}>{saving ? "Saving..." : "Save"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, backgroundColor: "#F7F5F0" },
  title: { fontSize: 26, fontWeight: "600", marginBottom: 8, color: "#14140F" },
  subtitle: { fontSize: 14, color: "#6B6B6B", lineHeight: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: "600", color: "#14140F" },
  sectionAction: { fontSize: 14, color: "#1D9E75", fontWeight: "600" },
  emptyCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginBottom: 24 },
  emptyText: { fontSize: 13, color: "#6B6B6B", lineHeight: 18 },
  keyDateCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    width: 140,
  },
  keyDateDays: { fontSize: 20, fontWeight: "700", color: "#D85A30", marginBottom: 6 },
  keyDateTitle: { fontSize: 13, color: "#14140F" },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20, marginTop: 8 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8, color: "#14140F" },
  cardBody: { fontSize: 14, color: "#6B6B6B", lineHeight: 20, marginBottom: 16 },
  button: { backgroundColor: "#1D9E75", borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  link: { textAlign: "center", color: "#9A9A9A", fontSize: 13 },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 24 },
  modalCard: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: "600", marginBottom: 16, color: "#14140F" },
  input: {
    backgroundColor: "#F7F5F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    fontSize: 15,
  },
  error: { color: "#B3261E", fontSize: 13, marginBottom: 8 },
});
