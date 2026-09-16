import {
  ACCENTS,
  DEFAULT_ACCENT,
  DEFAULT_GROUND,
  GROUNDS,
  isAccentName,
  isGroundName,
  lightTheme,
  tealTheme,
  themeFor,
} from "@/theme/tokens";

// The cream ground is the classic light-and-dark pair; the tests below that
// reason about "light" pass it explicitly, because the default ground is now
// the deep teal, which is a dark-ground theme even by day.
const CREAM = "cream" as const;

describe("themeFor", () => {
  it("follows the system scheme on 'system' and ignores it otherwise", () => {
    expect(themeFor("system", "dark", DEFAULT_ACCENT, CREAM).scheme).toBe("dark");
    expect(themeFor("system", "light", DEFAULT_ACCENT, CREAM).scheme).toBe("light");
    expect(themeFor("light", "dark", DEFAULT_ACCENT, CREAM).scheme).toBe("light");
    expect(themeFor("dark", "light", DEFAULT_ACCENT, CREAM).scheme).toBe("dark");
  });

  it("leaves the default accent exactly as the base theme", () => {
    expect(themeFor("light", "light", DEFAULT_ACCENT, CREAM)).toBe(lightTheme);
    expect(themeFor("light", "light", DEFAULT_ACCENT, "teal")).toBe(tealTheme);
  });

  it("applies a chosen accent", () => {
    const blue = ACCENTS.find((a) => a.name === "blue")!;
    const theme = themeFor("light", "light", "blue", CREAM);
    expect(theme.accent).toBe(blue.light.on);
    expect(theme.accentSoft).toBe(blue.light.soft);
  });

  // A colour lifted for dark mode glares in light, and vice versa, so each
  // accent has to carry both.
  it("uses the dark pair on the dark theme", () => {
    const blue = ACCENTS.find((a) => a.name === "blue")!;
    expect(themeFor("dark", "light", "blue", CREAM).accent).toBe(blue.dark.on);
    expect(blue.dark.on).not.toBe(blue.light.on);
  });

  // Key dates are drawn in the accent everywhere else, so the calendar legend
  // stops matching the grid if the dot doesn't move too.
  it("moves the key-date dot with the accent", () => {
    const theme = themeFor("light", "light", "rose", CREAM);
    expect(theme.dotKeyDate).toBe(theme.accent);
  });

  it("leaves the brand alone", () => {
    expect(themeFor("light", "light", "violet", CREAM).brand).toBe(lightTheme.brand);
  });

  it("falls back to the base theme for an unknown accent", () => {
    // Only reachable from stored data written by another build.
    const theme = themeFor("light", "light", "chartreuse" as never, CREAM);
    expect(theme.accent).toBe(lightTheme.accent);
  });
});

describe("the ground", () => {
  it("defaults to the deep teal, which the icon and website wear", () => {
    expect(DEFAULT_GROUND).toBe("teal");
    expect(themeFor("light", "light")).toBe(tealTheme);
  });

  // It is a dark-ground theme in every way that matters -- the status bar,
  // the lifted accent pairs -- so it says so.
  it("treats the deep teal as a dark ground", () => {
    expect(tealTheme.scheme).toBe("dark");
    const blue = ACCENTS.find((a) => a.name === "blue")!;
    expect(themeFor("light", "light", "blue", "teal").accent).toBe(blue.dark.on);
  });

  it("keeps night the same on either ground", () => {
    expect(themeFor("dark", "light", DEFAULT_ACCENT, "teal")).toBe(
      themeFor("dark", "light", DEFAULT_ACCENT, CREAM)
    );
  });

  it("keeps the brand coral on every ground", () => {
    expect(lightTheme.brand).toBe("#E9705A");
    expect(tealTheme.brand).toBe("#EF7A62");
  });

  it("puts dark type on the coral button on the teal ground", () => {
    // Cream on coral is 2.5:1 and unreadable; the near-black is what reads.
    expect(tealTheme.textOnBrand).toBe("#14130F");
  });

  it("offers exactly the two schemes, and validates their names", () => {
    expect(GROUNDS.map((g) => g.name).sort()).toEqual(["cream", "teal"]);
    expect(isGroundName("teal")).toBe(true);
    expect(isGroundName("cream")).toBe(true);
    expect(isGroundName("orange")).toBe(false);
    expect(isGroundName(undefined)).toBe(false);
  });
});

describe("isAccentName", () => {
  it("accepts every accent it ships with", () => {
    for (const a of ACCENTS) expect(isAccentName(a.name)).toBe(true);
  });

  // Guards stored AsyncStorage values, so the junk cases matter.
  it("rejects anything else", () => {
    expect(isAccentName("chartreuse")).toBe(false);
    expect(isAccentName(null)).toBe(false);
    expect(isAccentName(undefined)).toBe(false);
    expect(isAccentName(7)).toBe(false);
  });
});

describe("ACCENTS", () => {
  it("has unique names and real hex pairs", () => {
    const names = ACCENTS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);

    for (const a of ACCENTS) {
      for (const pair of [a.light, a.dark]) {
        expect(pair.on).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(pair.soft).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(pair.on).not.toBe(pair.soft);
      }
    }
  });
});
