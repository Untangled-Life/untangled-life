/**
 * Dates are stored ISO (YYYY-MM-DD) because that is what Postgres `date`
 * columns compare and sort on, and every range query in the app depends on it.
 * They are shown to people in Australian order (DD-MM-YYYY). These helpers are
 * the only place the two formats meet.
 */

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const DISPLAY = /^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** A Date (local midnight) as the ISO string the database stores. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * An ISO date string as a local Date at midnight.
 *
 * Parsed field by field rather than via `new Date(iso)`: that treats a bare
 * YYYY-MM-DD as UTC, so anywhere east of Greenwich it lands on the previous
 * day.
 */
export function fromISODate(iso: string): Date | null {
  if (!ISO.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  // Rejects 31-02 and friends, which JS would otherwise roll over silently.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** ISO in, DD-MM-YYYY out. Empty string for anything unparseable. */
export function toDisplayDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = fromISODate(iso.slice(0, 10));
  if (!d) return "";
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

/** DD-MM-YYYY (or with / . or spaces) in, ISO out. Null if it isn't a date. */
export function fromDisplayDate(text: string): string | null {
  const m = DISPLAY.exec(text.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  return fromISODate(iso) ? iso : null;
}

/** "Sun 20 Sep 2026" -- for reading rather than editing. */
export function toFriendlyDate(iso: string | null | undefined, withYear = true): string {
  if (!iso) return "";
  const d = fromISODate(iso.slice(0, 10));
  if (!d) return "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
  const base = `${weekday} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return withYear ? `${base} ${d.getFullYear()}` : base;
}

/** "HH:MM" from a Date, 24-hour, for storing a wall-clock time. */
export function toTimeString(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * "HH:MM" or "HH:MM:SS" as a Date today, for seeding a time picker.
 *
 * Validated rather than trusted: Number("") is 0, not NaN, so a blank time
 * would otherwise sail through a Number.isFinite check and silently become
 * midnight -- which reads as a real answer and blocks out the whole night.
 */
export function fromTimeString(time: string): Date {
  const parts = (time ?? "").split(":");
  const inRange = (value: string, max: number) => {
    const n = Number(value);
    return value.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= max;
  };

  const hasBoth = parts.length >= 2;
  const h = hasBoth && inRange(parts[0], 23) ? Number(parts[0]) : 9;
  const m = hasBoth && inRange(parts[1], 59) ? Number(parts[1]) : 0;

  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

/** "08:30" -> "8:30 am". Times are entered in 24-hour but read better in 12. */
export function toDisplayTime(time: string | null | undefined): string {
  if (!time) return "";
  const [rawH, rawM] = time.split(":");
  const h = Number(rawH);
  const m = Number(rawM);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "";
  const suffix = h < 12 ? "am" : "pm";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${suffix}`;
}

export function isValidTimeString(time: string): boolean {
  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(time.trim());
}
