import { useEffect } from "react";
import { Redirect, Tabs, router } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/contexts/auth";
import { registerForPushNotifications } from "@/lib/pushRegistration";

export default function TabsLayout() {
  const { session, profile, loading } = useAuth();
  const userId = session?.user.id;
  const paired = Boolean(profile?.couple_id);

  // Ask for push once they're actually paired — the only notifications that
  // need a token are the ones triggered by the other partner, so there's
  // nothing to explain (or grant) before there is one.
  useEffect(() => {
    if (!userId || !paired) return;
    registerForPushNotifications(userId);
  }, [userId, paired]);

  // Tapping a push should land on the thing it's about.
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as { type?: string } | undefined;
      if (data?.type === "key_date") {
        router.push("/key-dates");
      } else if (data?.type === "planned_event") {
        router.push("/");
      }
    });
    return () => subscription.remove();
  }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F5F0" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  if (!profile?.couple_id) {
    return <Redirect href="/pair" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#D85A30",
        tabBarInactiveTintColor: "#9A9A9A",
        tabBarStyle: { backgroundColor: "#fff" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="key-dates" options={{ title: "Key Dates" }} />
      <Tabs.Screen name="todos" options={{ title: "To-dos" }} />
      <Tabs.Screen name="wishlists" options={{ title: "Wishlists" }} />
    </Tabs>
  );
}
