import { useCallback, useState } from "react";
import { RefreshControl,
  View, Text, StyleSheet, Pressable, ScrollView, TextInput } from "react-native";
import { press } from "@/components/press";
import { useRefreshOnFocus } from "@/hooks/useRefreshOnFocus";
import { useThemedStyles, useTheme } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { DateField } from "@/components/fields";
import { toFriendlyDate, fromISODate } from "@/lib/dates";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, displayTitleFor } from "@/lib/keyDates";
import { requestNotificationPermission, rescheduleKeyDateReminders } from "@/lib/notifications";


export default function KeyDates() {
  const styles = useThemedStyles(createStyles);
  const t = useTheme();

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

  // Refreshes whenever this screen comes back into view, not just on
  // mount — otherwise changes made elsewhere aren't here until a restart.
  const { refreshing, onRefresh } = useRefreshOnFocus(load);

  async function saveSingleton(
    kind: "anniversary" | "birthday",
    date: string,
    title: string,
    subjectUserId: string | null = null
  ) {
    if (!fromISODate(date) || !profile?.couple_id) {
      setError("Pick a date first.");
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

    const { error: saveError } = existing
      ? await supabase.from("key_dates").update({ date }).eq("id", existing.id)
      : await supabase.from("key_dates").insert({
          couple_id: profile.couple_id,
          created_by: profile.id,
          kind,
          title,
          date,
          recurring: true,
          subject_user_id: subjectUserId,
        });

    if (saveError) {
      setError(saveError.message);
      return;
    }

    load();
  }

  async function addMisc() {
    if (!miscTitle.trim() || !fromISODate(miscDate) || !profile?.couple_id) {
      setError("Give it a name and pick a date.");
      return;
    }
    setError(null);
    const { error: addError } = await supabase.from("key_dates").insert({
      couple_id: profile.couple_id,
      created_by: profile.id,
      kind: "misc",
      title: miscTitle.trim(),
      date: miscDate,
      recurring: true,
    });

    if (addError) {
      setError(addError.message);
      return;
    }

    setMiscTitle("");
    setMiscDate("");
    load();
  }

  async function removeMisc(id: string) {
    // Removed from the list first so it feels instant; if the delete fails the
    // reload below puts it back, which would otherwise look like a ghost.
    setDates((prev) => prev.filter((d) => d.id !== id));
    const { error: deleteError } = await supabase.from("key_dates").delete().eq("id", id);
    if (deleteError) setError(deleteError.message);
    load();
  }

  const miscDates = dates.filter((d) => d.kind === "misc");

  return (
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.textMuted} />
      } contentContainerStyle={styles.container}>
      <Text style={styles.title}>Key Dates</Text>
      <Text style={styles.subtitle}>
        We&apos;ll remind you 2 weeks, 1 week, and 3 days before each one — plenty of time to
        sort a card and a gift. Dates save as soon as you pick them.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Anniversary Date</Text>
        <DateField
          value={anniversaryInput || null}
          placeholder="Pick your anniversary"
          onChange={(iso) => {
            setAnniversaryInput(iso);
            saveSingleton("anniversary", iso, "Anniversary");
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{partnerName}&apos;s Birthday</Text>
        <DateField
          value={partnerBirthdayInput || null}
          placeholder={`Pick ${partnerName}'s birthday`}
          maximumDate={new Date()}
          onChange={(iso) => {
            setPartnerBirthdayInput(iso);
            saveSingleton("birthday", iso, "Birthday", partnerId);
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Your Birthday</Text>
        <Text style={styles.cardHint}>
          So {partnerName} gets the reminders for yours too.
        </Text>
        <DateField
          value={myBirthdayInput || null}
          placeholder="Pick your birthday"
          maximumDate={new Date()}
          onChange={(iso) => {
            setMyBirthdayInput(iso);
            saveSingleton("birthday", iso, "Birthday", myId);
          }}
        />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Misc</Text>
        {miscDates.map((d) => (
          <Pressable key={d.id} style={press(styles.miscRow)} onLongPress={() => removeMisc(d.id)}>
            <Text style={styles.miscTitle}>{d.title}</Text>
            <Text style={styles.miscDate}>{toFriendlyDate(d.date)}</Text>
          </Pressable>
        ))}
        <TextInput
          style={styles.input}
          placeholder="What is it?"
          placeholderTextColor={t.textMuted}
          value={miscTitle}
          onChangeText={setMiscTitle}
        />
        <View style={{ marginTop: 8 }}>
          <DateField
            value={miscDate || null}
            placeholder="Pick a date"
            onChange={setMiscDate}
          />
        </View>
        <Pressable style={press([styles.saveButton, { alignSelf: "flex-start", marginTop: 8 }])} onPress={addMisc}>
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
