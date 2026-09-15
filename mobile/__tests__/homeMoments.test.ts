import { giftHint, onThisDay, yearsAgoLabel, yearsSince, type KeyDateLike, type WishlistLike } from "@/lib/homeMoments";

const at = (iso: string) => new Date(iso + "T12:00:00");

describe("yearsSince", () => {
  it("counts whole years to the anniversary", () => {
    expect(yearsSince("2020-09-15", at("2026-09-15"))).toBe(6);
  });
  it("does not count a year not yet reached", () => {
    expect(yearsSince("2020-12-25", at("2026-09-15"))).toBe(5);
  });
});

describe("onThisDay", () => {
  const moveIn: KeyDateLike = { title: "Moved in together", date: "2021-09-15", end_date: null, recurring: false };

  it("finds a non-recurring key date whose day is today", () => {
    const m = onThisDay([moveIn], [], at("2026-09-15"));
    expect(m).toEqual({ kind: "keydate", title: "Moved in together", years: 5, href: "/key-dates" });
  });

  it("ignores a recurring date, which is the countdown's job", () => {
    const anniversary: KeyDateLike = { title: "Anniversary", date: "2019-09-15", end_date: null, recurring: true };
    expect(onThisDay([anniversary], [], at("2026-09-15"))).toBeNull();
  });

  it("ignores something from this very year", () => {
    const thisYear: KeyDateLike = { title: "New job", date: "2026-09-15", end_date: null, recurring: false };
    expect(onThisDay([thisYear], [], at("2026-09-15"))).toBeNull();
  });

  it("falls through to a loved date on its anniversary", () => {
    const m = onThisDay(
      [],
      [{ planned_event_id: "p1", title: "The coast walk", last_at: "2025-09-15T08:00:00Z" }],
      at("2026-09-15")
    );
    expect(m?.kind).toBe("loved");
    expect(m?.years).toBe(1);
    expect(m?.href).toBe("/day?date=2025-09-15");
  });

  it("finds nothing on an ordinary day", () => {
    expect(onThisDay([moveIn], [], at("2026-06-01"))).toBeNull();
  });
});

describe("yearsAgoLabel", () => {
  it("spells small numbers and digits the rest", () => {
    expect(yearsAgoLabel(1)).toBe("A year ago today");
    expect(yearsAgoLabel(3)).toBe("Three years ago today");
    expect(yearsAgoLabel(9)).toBe("9 years ago today");
  });
});

describe("giftHint", () => {
  const partner = "alyssa-id";
  const birthdays = [{ date: "2026-09-25", recurring: true, subject_user_id: partner }];
  const days = (_d: string, _r: boolean) => 10;

  const wishlists: WishlistLike[] = [
    { id: "w1", name: "Books", created_by: partner, itemCount: 3 },
    { id: "w2", name: "Big list", created_by: partner, itemCount: 8 },
    { id: "w3", name: "Gifts for Alyssa", created_by: "me-id", itemCount: 5 },
  ];

  it("surfaces the partner's fullest own list before their birthday", () => {
    const hint = giftHint(partner, "Alyssa", birthdays, wishlists, days);
    expect(hint?.wishlistId).toBe("w2");
    expect(hint?.daysUntil).toBe(10);
  });

  it("never points at the 'Gifts for them' list the giver keeps", () => {
    const onlyGiverList = wishlists.filter((w) => w.created_by === "me-id");
    const hint = giftHint(partner, "Alyssa", birthdays, onlyGiverList, days);
    expect(hint?.wishlistId).toBeNull();
    expect(hint?.partnerName).toBe("Alyssa");
  });

  it("stays quiet when the birthday is far off", () => {
    expect(giftHint(partner, "Alyssa", birthdays, wishlists, () => 40)).toBeNull();
  });

  it("stays quiet with no partner", () => {
    expect(giftHint(null, "Alyssa", birthdays, wishlists, days)).toBeNull();
  });
});
