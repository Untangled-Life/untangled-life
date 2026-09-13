import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, displayTitleFor } from "@/lib/keyDates";
import { requestNotificationPermission, rescheduleKeyDateReminders } from "@/lib/notifications";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export default function KeyDates() {
  const styles = useThemedStyles(createStyles);

  const { profile } = useAuth();
  const { me, partner } = useCoupleMembers();
  const [dates, setDates] = useState<KeyDateRow[]>([]);
  const [anniversaryInput, setAnniversaryInput] = useState("");
  const [myBirthdayInput, setMyBirthdayInput] = useState("");
  const [partnerBirthdayInput, setPartnerBirthdayInput] = useState("");
  const [miscTitle, setMiscTitle] = useState("");
  const [miscDate, setMiscDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  const partnerName = partner?.display_name ?? "Partner";
  const myId = me.id;
  const partnerId = partner?.id ?? null;

  const nameFor = useCallback(
    (userId: string | null) => {
      if (userId && userId === myId) return me.display_name ?? "You";
      if (userId && userId === partnerId) return partnerName;
      return partnerName;
    },
    [myId, partnerId, me.display_name, partnerName]
  );

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring, kind, subject_user_id")
      .order("date", { ascending: true });

    if (data) {
      const rows = data as KeyDateRow[];
      setDates(rows);
      setAnniversaryInput(rows.find((d) => d.kind === "anniversary")?.date ?? "");
      setMyBirthdayInput(
        rows.find((d) => d.kind === "birthday" && d.subject_user_id === myId)?.date ?? ""
      );
      setPartnerBirthdayInput(
        rows.find((d) => d.kind === "birthday" && d.subject_user_id === partnerId)?.date ?? ""
      );

      await requestNotificationPermission();
      await rescheduleKeyDateReminders(
        rows.map((d) => ({
          id: d.id,
          displayTitle: displayTitleFor(d, nameFor),
          date: d.date,
          recurring: d.recurring,
        }))
      );
    }
  }, [myId, partnerId, nameFor]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveSingleton(
    kind: "anniversary" | "birthday",
    date: string,
    title: string,
    subjectUserId: string | null = null
  ) {
    if (!DATE_PATTERN.test(date) || !profile?.couple_id) {
      setError("Enter a date as YYYY-MM-DD.");
      return;
    }
    setError(null);

    // A birthday is one per person, so match on the subject too -- otherwise
    // saving your own birthday would overwrite your partner's.
    const existing = dates.find(
      (d) =>
        d.kind === kind &&
        (kind !== "birthday" || d.subject_user_id === subjectUserId)
    );

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
        subject_user_id: subjectUserId,
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
            value={partnerBirthdayInput}
            onChangeText={setPartnerBirthdayInput}
            keyboardType="numbers-and-punctuation"
          />
          <Pressable
            style={styles.saveButton}
            onPress={() =>
              saveSingleton("birthday", partnerBirthdayInput, "Birthday", partnerId)
            }
          >
            <Text style={styles.saveButtonText}>Save</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Birthday</Text>
        <Text style={styles.cardHint}>
          So {partnerName} gets the reminders for yours too.
        </Text>
        <View style={styles.row}>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            value={myBirthdayInput}
            onChangeText={setMyBirthdayInput}
            keyboardType="numbers-and-punctuation"
          />
          <Pressable
            style={styles.saveButton}
            onPress={() => saveSingleton("birthday", myBirthdayInput, "Birthday", myId)}
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

const createStyles = (t: Theme) =>
  StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 40 },
  title: { fontSize: 26, fontWeight: "600", color: t.textPrimary, marginBottom: 8 },
  subtitle: { fontSize: 13, color: t.textSecondary, lineHeight: 18, marginBottom: 20 },
  error: { color: t.danger, fontSize: 13, marginBottom: 12 },
  card: { backgroundColor: t.surface, borderRadius: t.radius.lg, padding: 18, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: "600", color: t.textPrimary, marginBottom: 12 },
  cardHint: { fontSize: 12, color: t.textMuted, marginTop: -6, marginBottom: 12, lineHeight: 16 },
  row: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    backgroundColor: t.bg,
    borderRadius: t.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
  },
  saveButton: {
    backgroundColor: t.accent,
    borderRadius: t.radius.pill,
    paddingHorizontal: 18,
    justifyContent: "center",
  },
  saveButtonText: { color: t.surface, fontWeight: "600", fontSize: 13 },
  miscRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.surfaceSunken,
  },
  miscTitle: { fontSize: 14, color: t.textPrimary },
  miscDate: { fontSize: 13, color: t.textMuted },
  });
