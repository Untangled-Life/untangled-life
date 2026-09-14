import { ACCENTS, DEFAULT_ACCENT, isAccentName, themeFor } from "@/theme/tokens";

describe("themeFor", () => {
  it("follows the system scheme on 'system' and ignores it otherwise", () => {
    expect(themeFor("system", "dark").scheme).toBe("dark");
    expect(themeFor("system", "light").scheme).toBe("light");
    expect(themeFor("light", "dark").scheme).toBe("light");
    expect(themeFor("dark", "light").scheme).toBe("dark");
  });

  it("leaves the default accent exactly as the base theme", () => {
    expect(themeFor("light", "light", DEFAULT_ACCENT)).toBe(themeFor("light", "light"));
  });

  it("applies a chosen accent", () => {
    const blue = ACCENTS.find((a) => a.name === "blue")!;
    const theme = themeFor("light", "light", "blue");
    expect(theme.accent).toBe(blue.light.on);
    expect(theme.accentSoft).toBe(blue.light.soft);
  });

  // A colour lifted for dark mode glares in light, and vice versa, so each
  // accent has to carry both.
  it("uses the dark pair on the dark theme", () => {
    const blue = ACCENTS.find((a) => a.name === "blue")!;
    expect(themeFor("dark", "light", "blue").accent).toBe(blue.dark.on);
    expect(blue.dark.on).not.toBe(blue.light.on);
  });

  // Key dates are drawn in the accent everywhere else, so the calendar legend
  // stops matching the grid if the dot doesn't move too.
  it("moves the key-date dot with the accent", () => {
    const theme = themeFor("light", "light", "rose");
    expect(theme.dotKeyDate).toBe(theme.accent);
  });

  it("leaves the brand alone", () => {
    expect(themeFor("light", "light", "violet").brand).toBe(themeFor("light", "light").brand);
  });

  it("falls back to the base theme for an unknown accent", () => {
    // Only reachable from stored data written by another build.
    const theme = themeFor("light", "light", "chartreuse" as never);
    expect(theme.accent).toBe(themeFor("light", "light").accent);
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
