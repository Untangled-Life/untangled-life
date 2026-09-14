import { initialsFor } from "@/lib/initials";

describe("initialsFor", () => {
  it("uses first and last initial for a full name", () => {
    expect(initialsFor("Roy Trimarchi")).toBe("RT");
  });

  it("uses a single initial for one name", () => {
    expect(initialsFor("Alyssa")).toBe("A");
  });

  it("skips middle names rather than running out of room", () => {
    expect(initialsFor("Mary Jane Watson")).toBe("MW");
  });

  it("copes with extra whitespace", () => {
    expect(initialsFor("  roy   trimarchi  ")).toBe("RT");
  });

  // A profile with no display name still has to render something -- a blank
  // circle beside a calendar row is worse than a question mark.
  it("falls back for empty, whitespace and missing names", () => {
    expect(initialsFor("")).toBe("?");
    expect(initialsFor("   ")).toBe("?");
    expect(initialsFor(null)).toBe("?");
    expect(initialsFor(undefined)).toBe("?");
  });
});
