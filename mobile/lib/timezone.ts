import * as Localization from "expo-localization";

/**
 * Timezones, for two people who might not be in the same one.
 *
 * Two quite different kinds of time live in this app and they need opposite
 * treatment.
 *
 * ABSOLUTE INSTANTS -- a booked date, an event synced off a calendar -- are
 * stored as timestamptz and are the same moment for everybody. They only need
 * a zone to be DISPLAYED in.
 *
 * WALL-CLOCK RULES -- a 9am-5pm shift, "our evening runs 7pm to 11pm" -- are
 * not instants at all. They mean "9am where that person is", and turn into an
 * instant only once you know the zone. Storing them without one is what makes
 * a roster typed in Sydney silently become Perth hours the moment you land.
 */

/**
 * The zone this JavaScript environment is running in.
 *
 * Separate from deviceTimeZone() because that one reaches for a native module:
 * this is safe to call from pure logic and from tests, and it is the right
 * default for anything that needs "here" without being handed a zone.
 */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The IANA name for this device, e.g. "Australia/Sydney". */
export function deviceTimeZone(): string {
  // expo-localization reads it from the OS rather than from Intl, so it works
  // regardless of what the JS engine was built with.
  const fromOs = Localization.getCalendars()[0]?.timeZone;
  if (fromOs) return fromOs;

  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Whether this engine can do arithmetic in a NAMED zone, as opposed to just
 * reporting its own.
 *
 * Hermes has shipped Intl with timezone support for a while, but "has shipped"
 * and "is present in this build on this OS version" are different claims, and
 * every cross-zone calculation below depends on it. Checked once, at startup,
 * so the app can fall back rather than throwing somewhere deep in a date
 * calculation.
 */
let supported: boolean | null = null;

export function supportsNamedZones(): boolean {
  if (supported !== null) return supported;

  try {
    const instant = new Date("2026-09-14T02:00:00Z");
    const hourIn = (timeZone: string) =>
      new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).format(
        instant
      );

    // TWO zones, because one is not enough to tell the difference between an
    // engine that honours the name and one that ignores it. An engine that
    // ignores it answers with the same clock both times -- its own -- and a
    // phone that happens to be sitting on that offset would sail through a
    // single check while getting every other zone wrong.
    //
    // 02:00 UTC on 14 Sep 2026 is 22:00 on the 13th in New York and 11:00 in
    // Tokyo. No device can be in both.
    supported = hourIn("America/New_York") === "22" && hourIn("Asia/Tokyo") === "11";
  } catch {
    supported = false;
  }

  return supported;
}

/**
 * The offset of a zone at a given instant, in minutes east of UTC.
 *
 * Works by asking the formatter what the wall clock reads in that zone at that
 * instant, then treating those numbers as if they were UTC and taking the
 * difference. It is the standard trick, and it is correct across DST because
 * it asks about one specific instant rather than assuming a fixed offset.
 */
/**
 * Intl formatters are expensive to build and cheap to reuse, and these get
 * called per event per render -- a home screen listing a fortnight of plans
 * was constructing hundreds of them a frame. Keyed by zone, built once.
 */
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function cachedFormatter(
  key: string,
  build: () => Intl.DateTimeFormat
): Intl.DateTimeFormat {
  const existing = formatterCache.get(key);
  if (existing) return existing;

  const made = build();
  formatterCache.set(key, made);
  return made;
}

export function offsetMinutesAt(instant: Date, timeZone: string): number {
  if (!supportsNamedZones()) return -instant.getTimezoneOffset();

  try {
    const parts = cachedFormatter(
      `offset:${timeZone}`,
      () =>
        new Intl.DateTimeFormat("en-US", {
          timeZone,
          hour12: false,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
    ).formatToParts(instant);

    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");

    // hour can come back as 24 for midnight in some engines.
    const hour = get("hour") % 24;

    const asIfUtc = Date.UTC(
      get("year"),
      get("month") - 1,
      get("day"),
      hour,
      get("minute"),
      get("second")
    );

    return Math.round((asIfUtc - instant.getTime()) / 60000);
  } catch {
    return -instant.getTimezoneOffset();
  }
}

/**
 * The instant at which a given wall clock reads in a given zone.
 *
 * Two passes, because the offset depends on the instant and the instant
 * depends on the offset. The first guess lands within an hour, which is enough
 * to look up the right offset even on a day the clocks move.
 */
export function zonedTimeToInstant(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const firstOffset = offsetMinutesAt(new Date(guess), timeZone);

  const corrected = guess - firstOffset * 60000;
  const secondOffset = offsetMinutesAt(new Date(corrected), timeZone);

  // If the offset changed between the two, the first guess fell on the other
  // side of a transition. The second is computed from an instant that is
  // already close to correct, so it is normally the one to trust.
  const settled = new Date(guess - secondOffset * 60000);

  if (secondOffset === firstOffset) return settled;

  // ... normally, because on the morning the clocks go FORWARD the requested
  // time may not exist at all: 2:30am is skipped entirely, and the second
  // offset resolves it backwards to 1:30am. An hour earlier than asked for is
  // the wrong way to be wrong -- a shift starting "2:30" would be reported as
  // starting before its owner set an alarm.
  //
  // The test is whether the answer reads back as the time requested. When it
  // does not, the first offset gives the same wall clock pushed FORWARD past
  // the gap, which is what every calendar does with a time that was skipped.
  if (offsetMinutesAt(settled, timeZone) !== secondOffset) {
    return new Date(guess - firstOffset * 60000);
  }

  return settled;
}

/** The wall-clock date in a zone, as YYYY-MM-DD. */
export function dateKeyInZone(instant: Date, timeZone: string): string {
  if (!supportsNamedZones()) {
    const y = instant.getFullYear();
    const m = String(instant.getMonth() + 1).padStart(2, "0");
    const d = String(instant.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  // en-CA formats as YYYY-MM-DD, which saves reassembling the parts.
  return cachedFormatter(
    `datekey:${timeZone}`,
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
  ).format(instant);
}

/** "7:00 pm" in the given zone. */
export function timeInZone(instant: Date, timeZone: string): string {
  try {
    return cachedFormatter(
      `time:${timeZone}`,
      () =>
        new Intl.DateTimeFormat(undefined, {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
        })
    ).format(instant);
  } catch {
    return instant.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }
}

/**
 * Whether two zones are showing the same clock right now.
 *
 * Compares offsets rather than names, so Europe/London and Europe/Dublin do
 * not produce a pointless "their time" label all winter. They can diverge
 * later in the year, which is why this takes the instant it cares about rather
 * than answering once for the whole app.
 */
export function zonesDifferAt(instant: Date, a: string | null, b: string | null): boolean {
  if (!a || !b || a === b) return false;
  return offsetMinutesAt(instant, a) !== offsetMinutesAt(instant, b);
}

/** "Perth" out of "Australia/Perth", for a label beside a time. */
export function shortZoneName(timeZone: string | null): string {
  if (!timeZone) return "";
  const city = timeZone.split("/").pop() ?? timeZone;
  return city.replace(/_/g, " ");
}
