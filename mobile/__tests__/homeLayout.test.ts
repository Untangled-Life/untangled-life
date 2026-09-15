import {
  DEFAULT_HOME_ORDER,
  HomeLayout,
  HomeSection,
  moveSection,
  resolveHomeLayout,
  serializeHomeLayout,
  toggleSection,
  visibleSections,
} from "@/lib/homeLayout";

const layout = (order: HomeSection[], hidden: HomeSection[] = []): HomeLayout => ({
  order,
  hidden: new Set(hidden),
});

describe("resolveHomeLayout", () => {
  it("gives the default arrangement when nothing is stored", () => {
    const resolved = resolveHomeLayout(null);
    expect(resolved.order).toEqual(DEFAULT_HOME_ORDER);
    expect(resolved.hidden.size).toBe(0);
  });

  // A partial list only comes from an older build, so the sections it does
  // name keep their relative order while the ones it never saw are woven in
  // near where they'd default to. Their absolute positions aren't promised.
  it("keeps the relative order of what was stored", () => {
    const { order } = resolveHomeLayout(["freeTogether", "pinned"]);
    expect(order.indexOf("freeTogether")).toBeLessThan(order.indexOf("pinned"));
    expect(order).toHaveLength(DEFAULT_HOME_ORDER.length);
  });

  it("reads the ! marker as hidden", () => {
    const resolved = resolveHomeLayout(["pinned", "!freeTogether"]);
    expect(resolved.hidden.has("freeTogether")).toBe(true);
    expect(resolved.hidden.has("pinned")).toBe(false);
    expect(resolved.order).toContain("freeTogether");
  });

  // The reason hidden is a marker rather than an absence. A section added
  // after the user last arranged their Home must appear, not be silently off.
  it("appends a section the stored arrangement has never seen, visible", () => {
    const resolved = resolveHomeLayout(["!pinned", "keyDates"]);
    expect(resolved.order).toEqual(DEFAULT_HOME_ORDER);
    expect(resolved.hidden).toEqual(new Set(["pinned"]));
  });

  it("puts a new section at its default position, not the bottom", () => {
    // "keyDates" is missing; it belongs second.
    const resolved = resolveHomeLayout(["pinned", "bookedIn", "freeTogether"]);
    expect(resolved.order.slice(0, 3)).toEqual(["pinned", "keyDates", "bookedIn"]);
  });

  it("drops a section this build no longer has", () => {
    const resolved = resolveHomeLayout(["pinned", "somethingWeRemoved"]);
    expect(resolved.order).not.toContain("somethingWeRemoved" as HomeSection);
  });

  // The case that broke everyone who had ever touched the arrange screen
  // before a new section shipped: their stored list cannot mention it, and
  // it has to turn up visible, in the right place, rather than at the end or
  // not at all.
  it("slots a newly shipped section into its default position, visible", () => {
    const resolved = resolveHomeLayout([
      "pinned",
      "keyDates",
      "bookedIn",
      "freeTogether",
      "littleThings",
    ]);

    expect(resolved.order).toEqual([
      "pinned",
      "keyDates",
      "bookedIn",
      "freeTogether",
      "nextTrip",
      "littleThings",
    ]);
    expect(resolved.hidden.has("nextTrip")).toBe(false);
  });

  // The same thing for somebody who has rearranged. Anchoring off the first
  // stored section that sorts later put a new section above their pinned
  // countdown, purely because they had moved The Little Things to the top.
  it("slots it below its neighbours even when the order has been rearranged", () => {
    expect(
      resolveHomeLayout(["littleThings", "pinned", "keyDates", "bookedIn", "freeTogether"]).order
    ).toEqual(["littleThings", "pinned", "keyDates", "bookedIn", "freeTogether", "nextTrip"]);

    expect(
      resolveHomeLayout(["freeTogether", "littleThings", "pinned", "keyDates", "bookedIn"]).order
    ).toEqual(["freeTogether", "nextTrip", "littleThings", "pinned", "keyDates", "bookedIn"]);
  });

  it("drops duplicates rather than rendering a section twice", () => {
    const resolved = resolveHomeLayout(["pinned", "pinned"]);
    expect(resolved.order.filter((k) => k === "pinned")).toHaveLength(1);
  });

  // The app always writes the complete arrangement, so this is the case that
  // has to be exact: what you saved is what you get back.
  it("round-trips a complete arrangement unchanged", () => {
    const original = layout(
      ["freeTogether", "pinned", "keyDates", "bookedIn", "nextTrip", "littleThings"],
      ["pinned", "bookedIn"]
    );
    const full = resolveHomeLayout(serializeHomeLayout(original));
    expect(full.order).toEqual(original.order);
    expect(full.hidden).toEqual(original.hidden);
  });
});

describe("visibleSections", () => {
  it("leaves out the hidden ones but keeps the order", () => {
    expect(visibleSections(layout(["freeTogether", "pinned", "keyDates"], ["pinned"]))).toEqual([
      "freeTogether",
      "keyDates",
    ]);
  });

  it("can be empty -- hiding everything is a real choice", () => {
    expect(visibleSections(layout(["pinned"], ["pinned"]))).toEqual([]);
  });
});

describe("moveSection", () => {
  const three = layout(["pinned", "keyDates", "bookedIn"]);

  it("swaps with the neighbour", () => {
    expect(moveSection(three, "keyDates", -1).order).toEqual(["keyDates", "pinned", "bookedIn"]);
    expect(moveSection(three, "keyDates", 1).order).toEqual(["pinned", "bookedIn", "keyDates"]);
  });

  it("does nothing at either end", () => {
    expect(moveSection(three, "pinned", -1).order).toEqual(three.order);
    expect(moveSection(three, "bookedIn", 1).order).toEqual(three.order);
  });

  // Hidden sections still hold a position, so moving past one is a real move
  // rather than a no-op that looks like a broken button.
  it("moves past a hidden section", () => {
    const withHidden = layout(["pinned", "keyDates", "bookedIn"], ["keyDates"]);
    expect(moveSection(withHidden, "bookedIn", -1).order).toEqual([
      "pinned",
      "bookedIn",
      "keyDates",
    ]);
  });
});

describe("toggleSection", () => {
  it("hides and shows", () => {
    const once = toggleSection(layout(["pinned", "keyDates"]), "pinned");
    expect(once.hidden).toEqual(new Set(["pinned"]));
    expect(toggleSection(once, "pinned").hidden.size).toBe(0);
  });

  // Off and on again shouldn't relegate a section to the bottom.
  it("leaves the position alone", () => {
    const start = layout(["pinned", "keyDates", "bookedIn"]);
    const off = toggleSection(start, "keyDates");
    const backOn = toggleSection(off, "keyDates");
    expect(backOn.order).toEqual(start.order);
    expect(backOn.hidden.size).toBe(0);
  });
});
