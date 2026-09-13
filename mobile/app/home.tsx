import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { PermissionStatus } from "expo";
import * as Calendar from "expo-calendar";
import { useAuth } from "@/contexts/auth";

export default function Home() {
  const { profile, signOut } = useAuth();
  const [permission, setPermission] = useState<PermissionStatus | null>(null);
  const [calendarCount, setCalendarCount] = useState<number | null>(null);

  useEffect(() => {
    Calendar.getCalendarPermissions().then((result) => setPermission(result.status));
  }, []);

  async function requestAccess() {
    const result = await Calendar.requestCalendarPermissions();
    setPermission(result.status);
    if (result.status === PermissionStatus.GRANTED) {
      const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
      setCalendarCount(calendars.length);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>You&apos;re in</Text>
      <Text style={styles.subtitle}>
        You&apos;re paired up. Next step: connect your calendar so we can start finding
        time you&apos;re both free.
      </Text>

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
  container: { flexGrow: 1, padding: 24, paddingTop: 80, backgroundColor: "#F7F5F0" },
  title: { fontSize: 26, fontWeight: "600", marginBottom: 8 },
  subtitle: { fontSize: 14, color: "#6B6B6B", lineHeight: 20, marginBottom: 24 },
  card: { backgroundColor: "#fff", borderRadius: 16, padding: 20 },
  cardTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  cardBody: { fontSize: 14, color: "#6B6B6B", lineHeight: 20, marginBottom: 16 },
  button: { backgroundColor: "#1D9E75", borderRadius: 999, paddingVertical: 12, alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "600", fontSize: 14 },
  link: { textAlign: "center", color: "#9A9A9A", fontSize: 13 },
});
