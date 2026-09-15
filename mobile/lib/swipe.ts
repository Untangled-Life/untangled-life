/**
 * Where a swiped row lands when the finger comes off.
 *
 * Pulled out of the component because the whole complaint was about feel,
 * and feel is a decision function: given how far it moved and how fast it
 * was going, does the row open or snap shut? That is testable. A
 * PanResponder is not.
 */

/** How much of the row the action takes up when it is open. */
export const ACTION_WIDTH = 96;

/**
 * How far a slow drag has to go. Deliberately about a third of the action:
 * past this and you have clearly asked for it, short of it and you were
 * probably scrolling.
 */
export const OPEN_THRESHOLD = 32;

/**
 * Pixels per millisecond that counts as a flick.
 *
 * This is the whole fix. The old release only looked at distance, so a quick
 * flick -- the gesture every other iOS list answers to -- travelled 20px,
 * failed the distance test and snapped shut. You had to drag slowly and hold,
 * which is why it felt unlike everything else on the phone.
 *
 * 0.25 px/ms is roughly a finger crossing a phone in a third of a second:
 * fast enough that nobody does it while reading, slow enough that an ordinary
 * flick clears it comfortably.
 */
export const FLICK_VELOCITY = 0.25;

/**
 * And how far it has to have actually gone to count as one.
 *
 * Direction alone is not enough. The horizontal wobble at the end of a fast
 * vertical scroll produces a couple of pixels of travel at a high
 * instantaneous speed, and a delete button appearing under a thumb that was
 * scrolling is worse than a swipe that needed a second go.
 */
export const FLICK_TRAVEL = 8;

export type SwipeEnd = "open" | "closed";

export function resolveSwipe({
  open,
  dx,
  vx,
}: {
  /** Whether the row was already open when this gesture started. */
  open: boolean;
  /** How far the finger travelled. Negative is leftwards, towards the action. */
  dx: number;
  /** How fast it was going when it left. Negative is leftwards. */
  vx: number;
}): SwipeEnd {
  // Direction wins over distance when it was moving. A flick left opens even
  // from a standing start; a flick right closes even from most of the way
  // open, which is how you cancel without dragging all the way back.
  //
  // The hand has to have gone that way, and gone somewhere, as well as have
  // been going that way when it left.
  if (vx <= -FLICK_VELOCITY && dx <= -FLICK_TRAVEL) return "open";
  if (vx >= FLICK_VELOCITY && dx >= FLICK_TRAVEL) return "closed";

  // Measured from where the gesture started, not from the closed position, so
  // dragging it shut takes the same distance as dragging it open. Against the
  // travelled distance it used to need 64px back to close and 40px to open,
  // which is the wrong way round for the thing being fixed.
  return open ? (dx > OPEN_THRESHOLD ? "closed" : "open") : dx < -OPEN_THRESHOLD ? "open" : "closed";
}
