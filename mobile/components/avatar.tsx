import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";
import { initialsFor } from "@/lib/initials";

/**
 * A profile picture, or the person's initials while there isn't one.
 *
 * The initials matter more than they look: with no photo set, a grey circle
 * beside every row makes a shared calendar unreadable, because "whose is
 * this" is the first question you ask of it.
 */
export function Avatar({
  url,
  name,
  size = 40,
}: {
  url: string | null;
  name: string | null;
  size?: number;
}) {
  const styles = useThemedStyles(createStyles);
  const dimensions = { width: size, height: size, borderRadius: size / 2 };

  if (url) {
    return (
      <Image
        source={{ uri: url }}
        style={[styles.image, dimensions]}
        contentFit="cover"
        transition={150}
      />
    );
  }

  return (
    <View style={[styles.fallback, dimensions]}>
      <Text style={[styles.initials, { fontSize: size * 0.38 }]}>{initialsFor(name)}</Text>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    image: { backgroundColor: t.surfaceSunken },
    fallback: {
      backgroundColor: t.accentSoft,
      alignItems: "center",
      justifyContent: "center",
    },
    initials: { color: t.accent, fontWeight: "700" },
  });
