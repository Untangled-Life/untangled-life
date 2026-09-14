import { PALETTE, colorFor, ownerColor, shadeFor } from "@/lib/palette";

describe("PALETTE", () => {
  it("has 24 colours with unique names", () => {
    expect(PALETTE).toHaveLength(24);
    expect(new Set(PALETTE.map((c) => c.name)).size).toBe(24);
  });

  it("gives every colour a full set of readable values in both schemes", () => {
    for (const c of PALETTE) {
      for (const shade of [c.light, c.dark]) {
        for (const value of [shade.fill, shade.ink, shade.chip]) {
          expect(value).toMatch(/^#[0-9A-F]{6}$/);
        }
        // Text has to differ from the block it sits on.
        expect(shade.fill).not.toBe(shade.ink);
      }
      // Dark is a different hue treatment, not the light one reused.
      expect(c.light.fill).not.toBe(c.dark.fill);
    }
  });

  it("keeps the names lowercase, which is what the column constraint requires", () => {
    for (const c of PALETTE) expect(c.name).toBe(c.name.toLowerCase());
  });
});

describe("colorFor", () => {
  it("finds a stored colour by name", () => {
    expect(colorFor("denim").name).toBe("denim");
  });

  // Two people who have never picked must not come out the same, or colouring
  // the calendar is pointless before anyone touches a setting.
  it("gives different fallbacks to different users", () => {
    const a = colorFor(null, "11111111-1111-1111-1111-111111111111");
    const b = colorFor(null, "22222222-2222-2222-2222-222222222222");
    expect(a.name).not.toBe(b.name);
  });

  it("gives the same user the same fallback every time", () => {
    const id = "abcdef01-2345-6789-abcd-ef0123456789";
    expect(colorFor(null, id).name).toBe(colorFor(null, id).name);
    expect(colorFor(undefined, id).name).toBe(colorFor(null, id).name);
  });

  // A name from a later build, or from data we didn't write.
  it("falls back rather than returning nothing for an unknown name", () => {
    const id = "abcdef01-2345-6789-abcd-ef0123456789";
    expect(colorFor("chartreuse", id).name).toBe(colorFor(null, id).name);
  });

  it("copes with no user id at all", () => {
    expect(colorFor(null, null).name).toBe(PALETTE[0].name);
  });
});

describe("shadeFor", () => {
  it("picks the scheme's own values", () => {
    const c = colorFor("sky");
    expect(shadeFor(c, "light")).toBe(c.light);
    expect(shadeFor(c, "dark")).toBe(c.dark);
  });
});

describe("ownerColor", () => {
  const colors = new Map([["roy", "denim"]]);

  it("uses the owner's chosen colour", () => {
    expect(ownerColor("roy", colors)?.name).toBe("denim");
  });

  it("falls back for an owner who hasn't picked", () => {
    expect(ownerColor("alyssa", colors)).not.toBeNull();
  });

  // An event belonging to both of you isn't either partner's colour, and
  // borrowing one would say something untrue about whose it is.
  it("is null for a shared event", () => {
    expect(ownerColor(null, colors)).toBeNull();
  });
});
