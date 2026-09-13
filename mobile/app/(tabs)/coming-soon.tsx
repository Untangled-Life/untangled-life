import { View, Text, StyleSheet, Pressable } from "react-native";
import { press } from "@/components/press";
import { router } from "expo-router";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";

export default function ComingSoon() {
  const styles = useThemedStyles(createStyles);
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Not built yet</Text>
      <Text style={styles.body}>
        This one&apos;s on the list rather than in the app. Nothing here is hiding behind a
        placeholder — when it works, it&apos;ll work.
      </Text>
      <Pressable onPress={() => router.back()} style={press(styles.button)}>
        <Text style={styles.buttonText}>Back</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    screen: {
      flex: 1,
      backgroundColor: t.bg,
      alignItems: "center",
      justifyContent: "center",
      padding: t.space(8),
    },
    title: { fontSize: 22, fontWeight: "700", color: t.textPrimary, marginBottom: t.space(3) },
    body: {
      fontSize: 14,
      color: t.textSecondary,
      textAlign: "center",
      lineHeight: 21,
      marginBottom: t.space(8),
    },
    button: {
      backgroundColor: t.accent,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(3),
      paddingHorizontal: t.space(8),
    },
    buttonText: { color: t.textOnBrand, fontWeight: "600", fontSize: 14 },
  });
