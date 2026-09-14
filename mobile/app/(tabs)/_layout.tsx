import { useEffect } from "react";
import { Redirect, Tabs, router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/contexts/theme";
import { HomeIcon, BellIcon, CheckSquareIcon, GiftIcon } from "@/components/icons";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { registerForPushNotifications } from "@/lib/pushRegistration";

export default function TabsLayout() {
  const { session, profile, loading } = useAuth();
  const t = useTheme();
  const { partner, loading: membersLoading } = useCoupleMembers();
  const userId = session?.user.id;
  const paired = Boolean(profile?.couple_id) && Boolean(partner);

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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
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

  // A couple_id alone isn't "paired" -- create_couple_invite() sets it the
  // moment you generate a code, before anyone has joined. Without this, an
  // inviter waiting on their partner lands in the app alone, with no way back
  // to the screen showing their code.
  if (membersLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!partner) {
    return <Redirect href="/pair" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.textMuted,
        sceneStyle: { backgroundColor: t.bg },
        tabBarStyle: {
          backgroundColor: t.surface,
          borderTopColor: t.border,
          borderTopWidth: StyleSheet.hairlineWidth,
          height: 88,
          paddingTop: 8,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <HomeIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="key-dates"
        options={{
          title: "Key Dates",
          tabBarIcon: ({ color }) => <BellIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="todos"
        options={{
          title: "To-dos",
          tabBarIcon: ({ color }) => <CheckSquareIcon size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="wishlists"
        options={{
          title: "Wishlists",
          tabBarIcon: ({ color }) => <GiftIcon size={24} color={color} />,
        }}
      />
      {/* Reached from the Home header / cards, not the tab bar — href: null
          keeps them inside the gated tab group without adding tab buttons. */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="calendars" options={{ href: null }} />
      <Tabs.Screen name="work-hours" options={{ href: null }} />
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="coming-soon" options={{ href: null }} />
      <Tabs.Screen name="roster-import" options={{ href: null }} />
    </Tabs>
  );
}
