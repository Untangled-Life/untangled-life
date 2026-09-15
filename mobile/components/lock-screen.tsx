import { Pressable, StyleSheet, Text, View } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles } from "@/contexts/theme";
import { useAppLock } from "@/contexts/appLock";
import { HeartIcon } from "@/components/icons";
import { Theme } from "@/theme/tokens";

/**
 * What sits over the app while it is locked.
 *
 * Opaque and total, because the whole point is that the couple's year is not
 * behind a blur somebody can squint through. No content, no counts, nothing
 * that leaks. Just the way back in.
 */
export function LockScreen() {
  const styles = useThemedStyles(createStyles);
  const { locked, unlock } = useAppLock();

  return (
    <View style={styles.screen}>
      <HeartIcon size={40} color={styles.mark.color} />
      <Text style={styles.title}>Untangled Life</Text>
      {/* The button appears only once there is something to unlock. While the
          app is merely inactive, or the setting is still loading, this is a
          plain cover with nothing to press -- there is no prompt to answer
          yet. */}
      {locked ? (
        <>
          <Text style={styles.body}>Locked. Unlock with Face ID or your passcode.</Text>
          <Pressable style={press(styles.button)} onPress={unlock} accessibilityRole="button">
            <Text style={styles.buttonText}>Unlock</Text>
          </Pressable>
        </>
      ) : null}
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    screen: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: t.bg,
      alignItems: "center",
      justifyContent: "center",
      gap: t.space(3),
      padding: t.space(8),
    },
    mark: { color: t.brand },
    title: { ...t.type.display, color: t.textPrimary },
    body: { ...t.type.body, color: t.textSecondary, textAlign: "center" },
    button: {
      marginTop: t.space(4),
      backgroundColor: t.brand,
      borderRadius: t.radius.pill,
      paddingVertical: t.space(3),
      paddingHorizontal: t.space(8),
    },
    buttonText: { ...t.type.label, color: t.textOnBrand },
  });
