// Time-zone arithmetic for scheduling. Wall-clock configuration (working
// hours, time off) is authored in a location's local time; canonical storage
// is UTC epoch milliseconds. Conversion goes through Intl — no dependency,
// and the browser/runtime tz database handles DST rules for us.
// ponytail: Intl round-trip instead of a date library. Swap for Temporal
// when it is available in both the Convex runtime and Node.

export const MINUTE_MS = 60_000;
export const DAY_MINUTES = 1440;

const PARTS = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = PARTS.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    PARTS.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  date: string; // ISO YYYY-MM-DD, local
  minutes: number; // minutes from local midnight
  weekday: number; // 0=Sunday … 6=Saturday
}

/** Wall-clock representation of an instant in a time zone. */
export function zonedParts(utcMs: number, timeZone: string): ZonedParts {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const [year, month, day, hour, minute] = [
    get("year"),
    get("month"),
    get("day"),
    get("hour"),
    get("minute"),
  ];
  const date = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return {
    date,
    minutes: hour * 60 + minute,
    // Date.UTC of the local wall clock gives the same weekday as the local
    // calendar day, without re-formatting.
    weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay(),
  };
}

/** Offset in ms that the zone is ahead of UTC at the given instant. */
function offsetAt(utcMs: number, timeZone: string): number {
  const parts = formatter(timeZone).formatToParts(new Date(utcMs));
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Sub-second remainder would bias the offset; instants are whole seconds
  // after the Date.UTC round-trip, so align the comparison the same way.
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * Converts a local date + minutes-from-midnight in `timeZone` to the UTC
 * instant. Returns null when that wall-clock time does not exist (the
 * spring-forward gap) so callers can skip the slot rather than invent one.
 * For the ambiguous fall-back hour the earlier (pre-transition) instant wins.
 */
export function zonedTimeToUtc(
  date: string,
  minutes: number,
  timeZone: string,
): number | null {
  const [year, month, day] = date.split("-").map(Number);
  const guess = Date.UTC(year, month - 1, day) + minutes * MINUTE_MS;
  // Two passes: the first offset may be the wrong side of a transition.
  let utc = guess - offsetAt(guess, timeZone);
  utc = guess - offsetAt(utc, timeZone);
  const check = zonedParts(utc, timeZone);
  if (check.date !== date || check.minutes !== minutes) return null;
  return utc;
}

/** Adds calendar days to an ISO date string (no time-zone involvement). */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

/** Inclusive list of ISO dates from `start` to `end`. */
export function datesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

export function formatLocalTime(utcMs: number, timeZone: string): string {
  const { minutes } = zonedParts(utcMs, timeZone);
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
