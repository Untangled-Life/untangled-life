import { useMemo, type ReactNode } from "react";
import { PanResponder, View } from "react-native";

/**
 * Swipe in from the left edge to go back.
 *
 * Every screen in here has a way out at the top or the bottom of a phone that
 * has got taller every year. The gesture is the one the whole platform
 * already teaches -- drag in from the bezel -- and it means the way out is
 * under the thumb that is already holding the phone.
 *
 * What "back" means is the caller's business: one screen where there is one,
 * Home from a tab, where there is nothing behind it.
 *
 * A wrapper rather than a strip laid over the left edge. An overlay is the
 * obvious way to do this and the wrong one: it is the topmost view in that
 * band, so every tap within 24px of the left edge would die there whether or
 * not anybody swiped. As an ancestor it never takes a touch of its own, and
 * only claims the gesture once a finger that started at the edge has actually
 * set off across the screen.
 */

/** How close to the edge it has to start. Roughly the bezel. */
const EDGE_WIDTH = 24;

/** How far it has to have gone before this stops being a scroll. */
const CLAIM_TRAVEL = 14;

/** And how far before letting go means going. */
const COMMIT_TRAVEL = 64;

/** Or how fast, for a flick that does not bother travelling. See lib/swipe.ts. */
const COMMIT_VELOCITY = 0.3;
const FLICK_TRAVEL = 24;

export function EdgeBack({
  enabled,
  onTrigger,
  children,
}: {
  /** Off on Home, and anywhere you are not meant to leave. */
  enabled: boolean;
  onTrigger: () => void;
  children: ReactNode;
}) {
  const responder = useMemo(
    () =>
      PanResponder.create({
        // Never on a touch alone. A tap anywhere on the screen has to reach
        // whatever was tapped.
        onStartShouldSetPanResponderCapture: () => false,

        // On the capture pass rather than the bubble, because almost
        // everything under here is inside a ScrollView, and by the time a
        // scroll has the gesture it is not giving it back. The conditions are
        // narrow enough to pay for that: it has to have started on the bezel,
        // gone right, and gone right much more than it has gone anywhere else
        // -- which is nothing a list, a row swipe or a scroll ever does.
        onMoveShouldSetPanResponderCapture: (_e, g) =>
          enabled &&
          g.x0 <= EDGE_WIDTH &&
          g.dx > CLAIM_TRAVEL &&
          g.dx > Math.abs(g.dy) * 2,

        onPanResponderRelease: (_e, g) => {
          // Dragging back to the edge and letting go is how you change your
          // mind, so it is not simply "the gesture happened".
          if (g.dx > COMMIT_TRAVEL || (g.vx > COMMIT_VELOCITY && g.dx > FLICK_TRAVEL)) {
            onTrigger();
          }
        },
      }),
    [enabled, onTrigger]
  );

  return (
    <View style={{ flex: 1 }} {...responder.panHandlers}>
      {children}
    </View>
  );
}
