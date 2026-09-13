import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/contexts/auth";

export default function TabsLayout() {
  const { session, profile, loading } = useAuth();

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
      <Tabs.Screen name="todos" options={{ title: "To-dos" }} />
      <Tabs.Screen name="wishlists" options={{ title: "Wishlists" }} />
    </Tabs>
  );
}
