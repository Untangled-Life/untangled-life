import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { press } from "@/components/press";
import { ACTION_WIDTH, resolveSwipe } from "@/lib/swipe";
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

  // Where the row actually is, as opposed to where it was last told to go.
  // A finger can land on a row halfway through the spring, and dragging from
  // the destination rather than from the current position throws it up to
  // the full action width sideways under the thumb.
  const xRef = useRef(0);
  // And where it was when this gesture started, because the gesture reports
  // distance travelled from there.
  const startXRef = useRef(0);

  useEffect(() => {
    const id = translateX.addListener(({ value }) => {
      xRef.current = value;
    });
    return () => translateX.removeListener(id);
  }, [translateX]);

  const settle = (toValue: number, velocity = 0) => {
    Animated.spring(translateX, {
      toValue,
      // Carried over from the finger rather than starting from nothing. A
      // flick that stops dead and then re-accelerates reads as two gestures;
      // handing the spring the speed it already had makes the row keep going.
      // vx is pixels per millisecond; Animated wants them per second.
      velocity: velocity * 1000,
      // Nothing behind the row's right edge is meant to be seen, and a
      // carried velocity into a critically damped spring still overshoots.
      overshootClamping: true,
      useNativeDriver: true,
      bounciness: 0,
      speed: 18,
    }).start(({ finished }) => {
      // The listener follows the animation, but a spring that ran to the end
      // lands on exactly the value, and one that was interrupted has already
      // reported where it stopped.
      if (finished) xRef.current = toValue;
    });
  };

  /** Far enough across to count as open, for a gesture that began mid-spring. */
  const isOpen = () => xRef.current <= -ACTION_WIDTH / 2;

  /* eslint-disable react-hooks/refs -- these are read inside the gesture
     callbacks, which run while a finger is on the screen, never during a
     render. Holding the row's position in state instead would rebuild the
     responder mid-gesture and drop the drag. */
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only claim clearly horizontal drags, so the list still scrolls
        // under a finger that is mostly going up or down.
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) > Math.abs(g.dy) * 1.5 && Math.abs(g.dx) > 6,
        // Whatever it was doing, it is now doing what the finger says. Without
        // stopping it, the native driver keeps writing the value every frame
        // and the drag is invisible until the spring finishes.
        onPanResponderGrant: () => {
          translateX.stopAnimation();
          startXRef.current = xRef.current;
        },
        onPanResponderMove: (_e, g) => {
          translateX.setValue(Math.min(0, Math.max(-ACTION_WIDTH, startXRef.current + g.dx)));
        },
        onPanResponderRelease: (_e, g) => {
          // Distance AND speed. See lib/swipe.ts: a flick is how everything
          // else on the phone does this, and only looking at distance is why
          // this used to need holding.
          const end = resolveSwipe({
            open: startXRef.current <= -ACTION_WIDTH / 2,
            dx: g.dx,
            vx: g.vx,
          });
          const toValue = end === "open" ? -ACTION_WIDTH : 0;

          // Only the part of the throw that points where the row is going,
          // and none of it at all if the row is already there. A shut row
          // flicked rightwards never moved -- the drag is clamped at zero --
          // so handing the spring that speed would fire it off its own target
          // and bounce it back for a gesture that did nothing.
          const carried =
            Math.abs(xRef.current - toValue) < 0.5
              ? 0
              : toValue === 0
                ? Math.max(0, g.vx)
                : Math.min(0, g.vx);

          settle(toValue, carried);
        },
        onPanResponderTerminate: () => settle(isOpen() ? -ACTION_WIDTH : 0),
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
