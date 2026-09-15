import { useRef } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";

/**
 * A menu of actions for one thing, as a sheet rather than an Alert.
 *
 * Alert looks like the obvious way to do this and quietly is not: on Android
 * React Native keeps the first THREE buttons and throws the rest away without
 * a word, and the dialog it shows is not cancelable -- so a six-item menu
 * becomes three items and no way out but doing one of them. A menu that
 * silently loses half of itself on one of the two platforms is worse than no
 * menu at all.
 *
 * The other half of its job is WHEN the action runs. Most of these actions
 * open something else -- a date picker, a confirmation -- and on iOS
 * presenting a second modal while this one is still sliding away shows
 * neither and logs that a presentation is already in progress. So on iOS the
 * chosen action is held until the system says the sheet has actually gone,
 * which is what Modal's onDismiss means and is the only reliable signal for
 * it. On Android modals are separate windows with no such conflict, so it
 * runs straight away rather than waiting for an animation nobody is watching.
 */
export type SheetAction = {
  label: string;
  onPress: () => void;
  destructive?: boolean;
};

export function ActionSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
  onDismissed,
}: {
  visible: boolean;
  title: string;
  subtitle?: string | null;
  actions: SheetAction[];
  /** Start closing it. */
  onClose: () => void;
  /** It has gone. Safe to open something else, and to forget what it was about. */
  onDismissed: () => void;
}) {
  const styles = useThemedStyles(createStyles);
  const pending = useRef<null | (() => void)>(null);

  function close(run?: () => void) {
    onClose();

    if (Platform.OS === "ios") {
      pending.current = run ?? null;
      return;
    }

    onDismissed();
    run?.();
  }

  function dismissed() {
    const run = pending.current;
    pending.current = null;
    onDismissed();
    run?.();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => close()}
      onDismiss={dismissed}
    >
      <Pressable style={press(styles.backdrop)} onPress={() => close()} />

      <View style={styles.sheet}>
        <Text style={styles.title} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        <ScrollView style={styles.list} bounces={false}>
          {actions.map((action, i) => (
            <Pressable
              key={action.label}
              style={press([styles.action, i > 0 ? styles.actionDivider : null])}
              onPress={() => close(action.onPress)}
            >
              <Text style={[styles.actionText, action.destructive ? styles.actionDanger : null]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable style={press(styles.cancel)} onPress={() => close()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)" },
    sheet: {
      backgroundColor: t.surface,
      borderTopLeftRadius: t.radius.xl,
      borderTopRightRadius: t.radius.xl,
      paddingTop: t.space(5),
      paddingBottom: t.space(9),
      paddingHorizontal: t.space(5),
    },
    title: { ...t.type.title, color: t.textPrimary },
    subtitle: { ...t.type.caption, color: t.textMuted, marginTop: t.space(1) },
    list: { marginTop: t.space(4), maxHeight: 340 },
    action: { paddingVertical: t.space(4) },
    actionDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.border },
    actionText: { ...t.type.body, color: t.textPrimary },
    actionDanger: { color: t.danger },
    cancel: {
      marginTop: t.space(3),
      paddingVertical: t.space(4),
      borderRadius: t.radius.pill,
      backgroundColor: t.surfaceSunken,
      alignItems: "center",
    },
    cancelText: { ...t.type.label, color: t.textSecondary },
  });
