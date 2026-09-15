import { ACTION_WIDTH, FLICK_TRAVEL, OPEN_THRESHOLD, resolveSwipe } from "@/lib/swipe";

describe("resolveSwipe", () => {
  it("opens on a flick that barely moved", () => {
    // The bug, written down: 20px is nowhere near the threshold, but it was
    // thrown, and every other list on the phone would have opened.
    expect(resolveSwipe({ open: false, dx: -20, vx: -0.9 })).toBe("open");
  });

  it("still opens on a slow drag that went far enough", () => {
    expect(resolveSwipe({ open: false, dx: -(OPEN_THRESHOLD + 5), vx: -0.01 })).toBe("open");
  });

  it("snaps back from a slow drag that did not", () => {
    expect(resolveSwipe({ open: false, dx: -(OPEN_THRESHOLD - 5), vx: -0.01 })).toBe("closed");
  });

  it("ignores a flick to the right when the row is shut", () => {
    expect(resolveSwipe({ open: false, dx: 30, vx: 1.2 })).toBe("closed");
  });

  it("closes an open row on a flick back", () => {
    expect(resolveSwipe({ open: true, dx: 10, vx: 1.2 })).toBe("closed");
  });

  it("keeps an open row open when the finger barely moves", () => {
    expect(resolveSwipe({ open: true, dx: 2, vx: 0 })).toBe("open");
  });

  it("closes an open row dragged most of the way back", () => {
    expect(resolveSwipe({ open: true, dx: ACTION_WIDTH - 10, vx: 0 })).toBe("closed");
  });

  // Symmetry. Shutting it should cost the same drag as opening it, and it
  // used to cost nearly twice as much.
  it("closes an open row on the same distance that opens a shut one", () => {
    expect(resolveSwipe({ open: true, dx: OPEN_THRESHOLD + 5, vx: 0 })).toBe("closed");
    expect(resolveSwipe({ open: true, dx: OPEN_THRESHOLD - 5, vx: 0 })).toBe("open");
  });

  // The list-fling case: thrown hard, but it barely went anywhere, and the
  // couple of pixels it did go were the wobble at the end of a scroll.
  it("ignores speed from a gesture that hardly moved", () => {
    expect(resolveSwipe({ open: false, dx: -(FLICK_TRAVEL - 3), vx: -0.9 })).toBe("closed");
    expect(resolveSwipe({ open: true, dx: FLICK_TRAVEL - 3, vx: 0.9 })).toBe("open");
  });

  it("ignores speed that disagrees with where the finger actually went", () => {
    expect(resolveSwipe({ open: false, dx: 20, vx: -0.9 })).toBe("closed");
  });

  it("opens an open row flicked further left rather than fighting it", () => {
    expect(resolveSwipe({ open: true, dx: -10, vx: -0.8 })).toBe("open");
  });

  it("keeps a shut row shut when a scroll rolls it a few pixels right", () => {
    expect(resolveSwipe({ open: false, dx: 4, vx: 0.05 })).toBe("closed");
  });
});
