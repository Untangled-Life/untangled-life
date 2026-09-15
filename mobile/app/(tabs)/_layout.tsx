import { useCallback, useEffect } from "react";
import { Redirect, Tabs, router, usePathname } from "expo-router";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/contexts/theme";
import { HomeIcon, BellIcon, CheckSquareIcon, GiftIcon } from "@/components/icons";
import { useCoupleMembers } from "@/hooks/useCoupleMembers";
import { registerForPushNotifications } from "@/lib/pushRegistration";
import { syncPlannedEventsToDevice } from "@/lib/plannedEvents";
import { useTimeZoneSync } from "@/hooks/useTimeZoneSync";
import { tapped } from "@/lib/haptics";
import { TopScrim } from "@/components/top-scrim";
import { EdgeBack } from "@/components/edge-back";

/**
 * The four screens the tab bar itself goes to. Nothing sits behind these, so
 * the edge swipe takes them Home rather than stepping back through whichever
 * tabs somebody happened to visit.
 */
const TAB_ROUTES = ["/", "/key-dates", "/todos", "/wishlists"];

export default function TabsLayout() {
  const { session, profile, loading } = useAuth();
  const t = useTheme();
  const pathname = usePathname();

  // Home is the exception: its cover photo runs deliberately to the top edge
  // and carries its own dark scrim, so a cream one over the top would be a
  // bar across somebody's face.
  const scrim = pathname !== "/";

  // Home is where the gesture goes, so there is nothing for it to do there.
  // The walkthrough is the other exception: it is the one screen you are
  // meant to finish, and swiping out of it would only bounce you back.
  const edgeBack = pathname !== "/" && pathname !== "/welcome";

  // One step, not all the way out.
  //
  // A trip opened from Wishlist & Trips should go back to the list, the way
  // the button in the corner does and the way the same gesture does
  // everywhere else on the phone. It is only from a tab -- where there is no
  // screen behind this one, just another tab -- that back has no meaning and
  // Home is the answer.
  //
  // navigate rather than push for that case, so swiping out of four tabs in a
  // row does not leave four copies of Home stacked up behind the one you are
  // looking at.
  //
  // Deliberately without a canGoBack() check. Everything in here is a route on
  // the tab navigator, and the app sits inside a root stack holding exactly
  // one screen -- so canGoBack() asks the root, gets "no", and used to send
  // every trip and every event to Home no matter how they were opened. back()
  // does not ask the root: it goes to whichever navigator is actually in
  // front, which is the same thing the Back button in the corner of these
  // screens has always done.
  const onTab = TAB_ROUTES.includes(pathname);
  const swipeBack = useCallback(() => {
    tapped();
    if (onTab) router.navigate("/");
    else router.back();
  }, [onTab]);
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

  // Pairing is no longer a wall. It used to be the first thing a new account
  // met: sign up, and the app immediately asked for a code from a partner who
  // had not been invited yet, with nothing else reachable. The whole app is
  // worth something on your own -- your calendar, your key dates, your list --
  // and the invitation is an offer on the Home screen rather than a gate.
  //
  // A couple of one is still a couple as far as every table is concerned, so
  // the only thing worth waiting for is knowing whether there is somebody in
  // it with you; the screens read `partner` and go quiet where it is null.
  if (membersLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: t.bg }}>
        <ActivityIndicator />
      </View>
    );
  }

  // Everybody gets one at sign-up and the app asks for one on the way in, so
  // this means the ask failed -- offline, or against a database that has not
  // had solo-start.sql run against it. The pairing screen is the honest place
  // to land: it is the one screen that works without a couple, and it has a
  // sign-out on it, where a spinner has nothing at all.
  if (!profile?.couple_id) {
    return <Redirect href="/pair" />;
  }

  // Straight into the walkthrough the first time, and once only. onboarded_at
  // is stamped however it ends, including "I'll do the rest later", so nobody
  // is sent back to it twice -- what they skipped waits under the bell
  // instead.
  //
  // It runs on your own too. Connecting your calendars and putting your
  // working hours in is worth doing before anybody else arrives -- and it is
  // what makes the app show them something real the day they do.
  if (!profile.onboarded_at && pathname !== "/welcome") {
    return <Redirect href="/welcome" />;
  }

  return (
    <EdgeBack enabled={edgeBack} onTrigger={swipeBack}>
    <View style={{ flex: 1 }}>
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
        // Ten rather than eleven, and the same for all four. Two of these
        // labels are two words long, and a bar where one label is a point
        // smaller than its neighbours reads as a rendering fault rather than
        // as a label that needed the room.
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", marginTop: 2 },
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
          title: "Important Dates",
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
          title: "Wishlist & Trips",
          tabBarIcon: ({ color }) => <GiftIcon size={24} color={color} />,
        }}
      />
      {/* Reached from the Home header / cards, not the tab bar -- href: null
          keeps them inside the gated tab group without adding tab buttons.
          Expo Router builds the bar from the DIRECTORY, so a new file here
          becomes a tab the moment it exists unless it is listed below.
          __tests__/tabs.test.ts fails if one is ever missed. */}
      <Tabs.Screen name="calendar" options={{ href: null }} />
      <Tabs.Screen name="trip" options={{ href: null }} />
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
      <Tabs.Screen name="welcome" options={{ href: null }} />
      <Tabs.Screen name="inbox" options={{ href: null }} />
      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="valued" options={{ href: null }} />
      <Tabs.Screen name="coming-soon" options={{ href: null }} />
      <Tabs.Screen name="roster-import" options={{ href: null }} />
    </Tabs>

    {/* Last, so it sits over the screen rather than under it. Once here
        rather than on fifteen screens: a scrim that some screens have and
        others do not is worse than none, because the difference reads as one
        of them being broken. */}
    {scrim ? <TopScrim /> : null}
    </View>
    </EdgeBack>
  );
}
