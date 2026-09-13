import { useCallback, useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { Link } from "expo-router";
import * as Calendar from "expo-calendar";
import { PermissionStatus } from "expo";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/auth";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { KeyDateRow, daysUntil, displayTitleFor } from "@/lib/keyDates";

export default function Home() {
  const { profile, signOut } = useAuth();
  const { partner } = useCoupleMembers();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [calendarCount, setCalendarCount] = useState<number | null>(null);
  const [keyDates, setKeyDates] = useState<KeyDateRow[]>([]);

  const partnerName = partner?.display_name ?? "Partner";

  const loadKeyDates = useCallback(async () => {
    const { data } = await supabase
      .from("key_dates")
      .select("id, title, date, recurring, kind")
      .order("date", { ascending: true });
    if (data) setKeyDates(data as KeyDateRow[]);
  }, []);

  useEffect(() => {
    Calendar.getCalendarPermissionsAsync().then((result) => setPermission(result.status));
    loadKeyDates();
  }, [loadKeyDates]);

  async function requestAccess() {
    const result = await Calendar.requestCalendarPermissionsAsync();
    setPermission(result.status);
    if (result.status === PermissionStatus.GRANTED) {
      const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
      setCalendarCount(calendars.length);
    }
  }

  const upcoming = [...keyDates].sort(
    (a, b) => daysUntil(a.date, a.recurring) - daysUntil(b.date, b.recurring)
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>You&apos;re in</Text>
      <Text style={styles.subtitle}>
        You&apos;re paired up. Here&apos;s what&apos;s coming up together.
      </Text>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Key dates &amp; countdowns</Text>
        <Link href="/key-dates" style={styles.sectionAction}>
          Manage
        </Link>
      </View>

      {upcoming.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>
            No key dates yet — add {partnerName}&apos;s birthday or your anniversary to start a
            countdown.
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
                  {displayTitleFor(kd, partnerName)}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, paddingTop: 80, paddingBottom: 40 },
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
});
