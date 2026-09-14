import { PatternShift } from "@/lib/workHours";
import { toISODate } from "@/lib/dates";

/**
 * Reads a pasted roster into shifts.
 *
 * Rosters are written by people for people, so this is heuristics, not a
 * grammar. The contract is therefore: guess sensibly, and say when you guessed.
 * Nothing here saves anything -- every result goes to a confirm screen where the
 * uncertain rows are flagged and everything is editable.
 */

export type ParsedShift = {
  /** 0 = Sunday .. 6 = Saturday, matching JS getDay(). */
  weekday: number;
  /** Present when the line named an actual date rather than just a weekday. */
  date?: string; // ISO
  start: string; // "HH:MM"
  end: string; // "HH:MM"
  /** True when the line said "off"/"RDO" rather than giving hours. */
  off: boolean;
  /** Why this row might be wrong. Empty means it was unambiguous. */
  warnings: string[];
  /** The line it came from, so the confirm screen can show its working. */
  source: string;
};

export type ParseResult = {
  shifts: ParsedShift[];
  /** Lines that looked like they should be shifts but couldn't be read. */
  unparsed: string[];
};

const DAY_WORDS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, weds: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

const OFF_WORDS = /\b(off|rdo|rest|leave|annual leave|a\/l|day off)\b/i;

/**
 * A dash or an x standing in for "nothing on" -- but only when it is the entire
 * content beside the day. Treating any dash as "off" made "Mon 25:00-30:00"
 * into a day off, which is the worst possible reading: a shift you can't parse
 * silently becomes a day you're free.
 */
const STANDALONE_OFF = /^[^a-z0-9]*(?:[-–—x]|x{1,2})[^a-z0-9]*$/i;

/** Anything that reads as a time: 9, 9am, 9.30, 09:30, 0930, 5:30pm. */
const TIME = String.raw`(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a|p)?`;
const RANGE = new RegExp(`${TIME}\\s*(?:-|–|—|to|until|till|\\bt\\b)\\s*${TIME}`, "i");
const FOUR_DIGIT_RANGE = /\b(\d{4})\s*(?:-|–|—|to)\s*(\d{4})\b/;
const DATE_DMY = /\b(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?\b/;

/**
 * Two unmistakable times with only whitespace between them -- how a roster
 * arrives when pasted from spreadsheet cells. Each side must carry minutes or
 * an am/pm to qualify, so "Total hours 38 40" isn't read as a shift.
 */
const WS_TIME_PAIR =
  /(\d{1,2}[:.]\d{2}|\d{4}|\d{1,2}\s*(?:am|pm))\s+(\d{1,2}[:.]\d{2}|\d{4}|\d{1,2}\s*(?:am|pm))/i;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Resolve a bare hour against its partner.
 *
 * A roster saying "9-5" means 9am to 5pm; "10-2" means 10am to 2pm; "7-11"
 * could be either but morning is the safer read for a shift. The rule: if the
 * end would otherwise be at or before the start, push it into the afternoon.
 */
function resolve(
  h: number,
  minutes: number,
  meridiem: string | undefined
): { hour: number; minute: number; explicit: boolean } {
  let hour = h;
  const m = meridiem?.[0]?.toLowerCase();

  if (m === "p") {
    hour = h === 12 ? 12 : h + 12;
  } else if (m === "a") {
    hour = h === 12 ? 0 : h;
  }

  return { hour, minute: minutes, explicit: Boolean(m) };
}

function parseRange(line: string): { start: string; end: string; warnings: string[] } | null {
  const warnings: string[] = [];

  // Military-style 0830-1730 first: it can't be confused with an hour range.
  const four = FOUR_DIGIT_RANGE.exec(line);
  if (four) {
    const toHHMM = (v: string) => `${v.slice(0, 2)}:${v.slice(2)}`;
    const start = toHHMM(four[1]);
    const end = toHHMM(four[2]);
    if (Number(four[1].slice(0, 2)) > 23 || Number(four[2].slice(0, 2)) > 23) return null;
    return { start, end, warnings };
  }

  const m = RANGE.exec(line);
  if (!m) {
    // Try the whitespace-separated form by rewriting it into a dash range,
    // rather than duplicating all of the resolution logic below.
    const ws = WS_TIME_PAIR.exec(line);
    if (ws) return parseRange(`${ws[1]}-${ws[2]}`);
    return null;
  }

  const [, sh, sm, sMer, eh, em, eMer] = m;
  const startRaw = resolve(Number(sh), Number(sm ?? 0), sMer);
  let endRaw = resolve(Number(eh), Number(em ?? 0), eMer);

  // Neither end said am/pm: infer, and admit it.
  if (!startRaw.explicit && !endRaw.explicit) {
    if (endRaw.hour <= startRaw.hour && endRaw.hour < 12) {
      endRaw = { ...endRaw, hour: endRaw.hour + 12 };
      warnings.push("Assumed the finish is in the afternoon");
    }
  } else if (startRaw.explicit && !endRaw.explicit) {
    if (endRaw.hour <= startRaw.hour && endRaw.hour < 12) {
      endRaw = { ...endRaw, hour: endRaw.hour + 12 };
      warnings.push("Assumed the finish is in the afternoon");
    }
  } else if (!startRaw.explicit && endRaw.explicit) {
    // "9-5pm" -- the start is almost certainly morning.
    if (startRaw.hour >= 12) warnings.push("Assumed the start is in the morning");
  }

  if (startRaw.hour > 23 || endRaw.hour > 23) return null;

  return {
    start: `${pad(startRaw.hour)}:${pad(startRaw.minute)}`,
    end: `${pad(endRaw.hour)}:${pad(endRaw.minute)}`,
    warnings,
  };
}

function findWeekday(line: string): { weekday: number; matched: string } | null {
  const words = line.toLowerCase().match(/[a-z]+/g) ?? [];
  for (const w of words) {
    if (w in DAY_WORDS) return { weekday: DAY_WORDS[w], matched: w };
  }
  return null;
}

function findDate(line: string, year: number): string | null {
  const m = DATE_DMY.exec(line);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;

  let y = year;
  if (m[3]) y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);

  const d = new Date(y, month - 1, day);
  if (d.getDate() !== day || d.getMonth() !== month - 1) return null;
  return toISODate(d);
}

/**
 * Split a paste into candidate lines. Rosters arrive as lines, but also as one
 * run-on line with commas, or as tab-separated cells from a spreadsheet.
 */
function toLines(text: string): string[] {
  return text
    .split(/[\n\r;]+/)
    .flatMap((line) => (line.includes(",") && !/\d,\d/.test(line) ? line.split(",") : [line]))
    .map((l) => l.replace(/\t+/g, " ").trim())
    .filter(Boolean);
}

export function parseRoster(text: string, referenceYear = new Date().getFullYear()): ParseResult {
  const shifts: ParsedShift[] = [];
  const unparsed: string[] = [];

  for (const line of toLines(text)) {
    const day = findWeekday(line);
    const date = findDate(line, referenceYear);
    const range = parseRange(line);
    const withoutDay = day ? line.toLowerCase().replace(day.matched, "") : line;
    const isOff = !range && (OFF_WORDS.test(line) || STANDALONE_OFF.test(withoutDay.trim()));

    // Says nothing about hours. A line that names a weekday was probably meant
    // to be a shift and we failed to read it, so it gets surfaced; a line
    // carrying only a date is almost always a header ("WEEK COMMENCING
    // 14/09/2026") and is skipped, because reporting those as unreadable
    // trains you to ignore the warnings that matter.
    if (!range && !isOff) {
      if (day) unparsed.push(line);
      continue;
    }

    // Talks about hours but names no day or date, so there's nowhere to put
    // it. Surfaced rather than dropped: a shift silently discarded is worse
    // than one you're asked about.
    if (!day && !date) {
      unparsed.push(line);
      continue;
    }

    const weekday = day
      ? day.weekday
      : date
        ? new Date(date + "T00:00:00").getDay()
        : -1;

    if (isOff) {
      shifts.push({
        weekday,
        date: date ?? undefined,
        start: "",
        end: "",
        off: true,
        warnings: [],
        source: line,
      });
      continue;
    }

    if (!range) {
      unparsed.push(line);
      continue;
    }

    const warnings = [...range.warnings];
    if (range.end <= range.start) warnings.push("Runs past midnight");

    shifts.push({
      weekday,
      date: date ?? undefined,
      start: range.start,
      end: range.end,
      off: false,
      warnings,
      source: line,
    });
  }

  return { shifts, unparsed };
}

/** Parsed shifts as the weekly pattern shape work_patterns stores. */
export function toPatternShifts(parsed: ParsedShift[], week = 0): PatternShift[] {
  return parsed
    .filter((p) => !p.off && p.weekday >= 0 && p.start && p.end)
    .map((p) => ({ week, weekday: p.weekday, start: p.start, end: p.end }));
}

export function countWarnings(parsed: ParsedShift[]): number {
  return parsed.filter((p) => p.warnings.length > 0).length;
}
