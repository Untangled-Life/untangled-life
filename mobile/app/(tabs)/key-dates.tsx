import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, displayTitleFor } from "@/lib/keyDates";
import { requestNotificationPermission, rescheduleKeyDateReminders } from "@/lib/notifications";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function KeyDates() {
  const { profile } = useAuth();
  const { partner } = useCoupleMembers();
  const [dates, setDates] = useState<KeyDateRow[]>([]);
  const [anniversaryInput, setAnniversaryInput] = useState("");
  const [birthdayInput, setBirthdayInput] = useState("");
  const [miscTitle, setMiscTitle] = useState("");
  const [miscDate, setMiscDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const partnerName = partner?.display_name ?? "Partner";

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring, kind")
      .order("date", { ascending: true });

    if (data) {
      const rows = data as KeyDateRow[];
      setDates(rows);
      setAnniversaryInput(rows.find((d) => d.kind === "anniversary")?.date ?? "");
      setBirthdayInput(rows.find((d) => d.kind === "birthday")?.date ?? "");

      await requestNotificationPermission();
      await rescheduleKeyDateReminders(
        rows.map((d) => ({
          id: d.id,
          displayTitle: displayTitleFor(d, partnerName),
          date: d.date,
          recurring: d.recurring,
        }))
      );
    }
  }, [partnerName]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSingleton(kind: "anniversary" | "birthday", date: string, title: string) {
    if (!DATE_PATTERN.test(date) || !profile?.couple_id) {
      setError("Enter a date as YYYY-MM-DD.");
      return;
    }
    setError(null);

    const existing = dates.find((d) => d.kind === kind);
    if (existing) {
      await supabase.from("key_dates").update({ date }).eq("id", existing.id);
    } else {
      await supabase.from("key_dates").insert({
        couple_id: profile.couple_id,
        created_by: profile.id,
        kind,
        title,
        date,
        recurring: true,
      });
    }
    load();
  }

  async function addMisc() {
    if (!miscTitle.trim() || !DATE_PATTERN.test(miscDate) || !profile?.couple_id) {
      setError("Misc dates need a title and a date as YYYY-MM-DD.");
      return;
    }
    setError(null);
    await supabase.from("key_dates").insert({
      couple_id: profile.couple_id,
      created_by: profile.id,
      kind: "misc",
      title: miscTitle.trim(),
      date: miscDate,
      recurring: true,
    });
    setMiscTitle("");
    setMiscDate("");
    load();
  }

  async function removeMisc(id: string) {
    setDates((prev) => prev.filter((d) => d.id !== id));
    await supabase.from("key_dates").delete().eq("id", id);
    load();
  }

  const miscDates = dates.filter((d) => d.kind === "misc");

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Key Dates</Text>
      <Text style={styles.subtitle}>
        We&apos;ll remind you 2 weeks, 1 week, and 3 days before each one — plenty of time to
        sort a card and a gift.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Anniversary Date</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={anniversaryInput}
            onChangeText={setAnniversaryInput}
            keyboardType="numbers-and-punctuation"
          />
          <Pressable
            style={styles.saveButton}
            onPress={() => saveSingleton("anniversary", anniversaryInput, "Anniversary")}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{partnerName}&apos;s Birthday</Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={birthdayInput}
            onChangeText={setBirthdayInput}
            keyboardType="numbers-and-punctuation"
          />
          <Pressable
            style={styles.saveButton}
            onPress={() => saveSingleton("birthday", birthdayInput, "Birthday")}
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Misc</Text>
        {miscDates.map((d) => (
          <Pressable key={d.id} style={styles.miscRow} onLongPress={() => removeMisc(d.id)}>
            <Text style={styles.miscTitle}>{d.title}</Text>
            <Text style={styles.miscDate}>{d.date}</Text>
          </Pressable>
        ))}
        <View style={styles.row}>
          <TextInput
            style={[styles.input, { flex: 1.4 }]}
            placeholder="Title"
            value={miscTitle}
            onChangeText={setMiscTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={miscDate}
            onChangeText={setMiscDate}
            keyboardType="numbers-and-punctuation"
          />
        </View>
        <Pressable style={[styles.saveButton, { alignSelf: "flex-start", marginTop: 8 }]} onPress={addMisc}>
          <Text style={styles.saveButtonText}>+ Add another</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "600", color: "#14140F", marginBottom: 8 },
  subtitle: { fontSize: 13, color: "#6B6B6B", lineHeight: 18, marginBottom: 20 },
  error: { color: "#B3261E", fontSize: 13, marginBottom: 12 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: "#14140F", marginBottom: 12 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: "#F7F5F0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: "#1D9E75",
    borderRadius: 999,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  saveButtonText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  miscRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F0EEE8",
  },
  miscTitle: { fontSize: 14, color: "#14140F" },
  miscDate: { fontSize: 13, color: "#9A9A9A" },
});
