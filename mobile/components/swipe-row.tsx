import { useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { press } from "@/components/press";
import { useThemedStyles } from "@/contexts/theme";
import { Theme } from "@/theme/tokens";

/**
 * Swipe a row to reveal one action.
 *
 * Deliberately not react-native-gesture-handler's Swipeable: that pulls in
 * Reanimated, whose worklets runtime has to match the one Expo Go ships.
 * Reanimated 4 wants worklets 0.12 while Expo Go SDK 57 has 0.10, so
 * importing it crashes the app at startup. A swipe affordance is not worth a
 * native dependency and a version matrix, and React Native's own Animated
 * and PanResponder do this perfectly well.
 */
const ACTION_WIDTH = 96;
const OPEN_THRESHOLD = 40;

export function SwipeRow({
  actionLabel,
  onAction,
  soft = false,
  enabled = true,
  children,
}: {
  actionLabel: string;
  onAction: () => void;
  /** A tidier shade for actions that are not destructive. */
  soft?: boolean;
  /** A row with nothing to do does not swipe at all, rather than opening on an action that would fail. */
  enabled?: boolean;
  children: ReactNode;
}) {
  const styles = useThemedStyles(createStyles);

  // useState with a lazy initialiser rather than useRef: the value is read
  // during render, and a ref read during render is the thing refs are not
  // for. One Animated.Value either way.
  const [translateX] = useState(() => new Animated.Value(0));
  const openRef = useRef(false);

  const settle = (toValue: number) => {
    openRef.current = toValue !== 0;
    Animated.spring(translateX, {
      toValue,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start();
  };

  /* eslint-disable react-hooks/refs -- openRef is read inside the gesture
     callbacks, which run while a finger is on the screen, never during a
     render. Holding "is this row open" in state instead would rebuild the
     responder mid-gesture and drop the drag. */
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly horizontal drags, so the list still scrolls
        // under a finger that is mostly going up or down.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 6,
        onPanResponderMove: (_e, g) => {
          const base = openRef.current ? -ACTION_WIDTH : 0;
          translateX.setValue(Math.min(0, Math.max(-ACTION_WIDTH, base + g.dx)));
        },
        onPanResponderRelease: (_e, g) => {
          const base = openRef.current ? -ACTION_WIDTH : 0;
          const finalX = base + g.dx;
          settle(finalX < -OPEN_THRESHOLD ? -ACTION_WIDTH : 0);
        },
        onPanResponderTerminate: () => settle(openRef.current ? -ACTION_WIDTH : 0),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translateX]
  );
  /* eslint-enable react-hooks/refs */

  if (!enabled) return <>{children}</>;

  return (
    <View style={styles.wrap}>
      <View style={styles.actionLayer}>
        <Pressable
          style={press([styles.action, soft ? styles.actionSoft : null])}
          onPress={() => {
            // Closed first, so the row underneath is not left sitting open
            // behind whatever the action puts on screen.
            settle(0);
            onAction();
          }}
        >
          <Text style={[styles.actionText, soft ? styles.actionTextSoft : null]}>
            {actionLabel}
          </Text>
        </Pressable>
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

const createStyles = (t: Theme) =>
  StyleSheet.create({
    // NOT clipped. Rows carry the card shadow, and an overflow:hidden
    // ancestor takes both the iOS shadow and the Android elevation with it --
    // which would leave deletable rows flat and undeletable ones raised in
    // the same list.
    wrap: { position: "relative" },
    actionLayer: {
      position: "absolute",
      right: 0,
      top: 0,
      bottom: 8,
      width: ACTION_WIDTH,
      flexDirection: "row",
    },
    action: {
      flex: 1,
      backgroundColor: t.danger,
      justifyContent: "center",
      alignItems: "center",
      borderRadius: t.radius.md,
      marginLeft: 8,
    },
    actionSoft: { backgroundColor: t.surfaceSunken },
    actionText: { color: t.textOnBrand, ...t.type.label },
    actionTextSoft: { color: t.textSecondary },
  });
