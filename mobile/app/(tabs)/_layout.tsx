import { useEffect } from "react";
import { Redirect, Tabs, router } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/contexts/theme";
import { HomeIcon, BellIcon, CheckSquareIcon, GiftIcon } from "@/components/icons";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { registerForPushNotifications } from "@/lib/pushRegistration";
import { syncPlannedEventsToDevice } from "@/lib/plannedEvents";
import { useTimeZoneSync } from "@/hooks/useTimeZoneSync";

export default function TabsLayout() {
  const { session, profile, loading } = useAuth();
  const t = useTheme();
  const { partner, loading: membersLoading } = useCoupleMembers();

  // Keeps the stored zone matching the phone, here rather than on one screen
  // so it happens wherever in the app you happen to open.
  useTimeZoneSync();
  const userId = session?.user.id;
  const paired = Boolean(profile?.couple_id) && Boolean(partner);

  // Ask for push once they're actually paired -- the only notifications that
  // need a token are the ones triggered by the other partner, so there's
  // nothing to explain (or grant) before there is one.
  useEffect(() => {
    if (!userId || !paired) return;
    registerForPushNotifications(userId);
  }, [userId, paired]);

  // A push about a changed event carries the change with it: receiving one is
  // the cue to re-read, so the partner's calendar updates without anyone
  // opening anything.
  //
  // This fires while the app is running or in the background. A phone that is
  // fully closed still catches up on next open, which is what the sync on
  // focus is for -- silent background delivery needs more than a token and
  // isn't worth the complexity until push is proven end to end.
  useEffect(() => {
    if (!userId) return;

    const subscription = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as { type?: string } | undefined;
      if (data?.type === "planned_event") {
        syncPlannedEventsToDevice(userId).catch(() => {
          // Best effort. The next app open reconciles anyway.
        });
      }
    });

    return () => subscription.remove();
  }, [userId]);

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
      {/* Reached from the Home header / cards, not the tab bar -- href: null
          keeps them inside the gated tab group without adding tab buttons.
          Expo Router builds the bar from the DIRECTORY, so a new file here
          becomes a tab the moment it exists unless it is listed below.
          __tests__/tabs.test.ts fails if one is ever missed. */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="calendars" options={{ href: null }} />
      <Tabs.Screen name="free-time" options={{ href: null }} />
      <Tabs.Screen name="home-layout" options={{ href: null }} />
      <Tabs.Screen name="day" options={{ href: null }} />
      <Tabs.Screen name="event" options={{ href: null }} />
      <Tabs.Screen name="colors" options={{ href: null }} />
      <Tabs.Screen name="work-hours" options={{ href: null }} />
      <Tabs.Screen name="menu" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      <Tabs.Screen name="personalisation" options={{ href: null }} />
      <Tabs.Screen name="coming-soon" options={{ href: null }} />
      <Tabs.Screen name="roster-import" options={{ href: null }} />
    </Tabs>
  );
}
