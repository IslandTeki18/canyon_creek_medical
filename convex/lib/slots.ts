// Deterministic slot generation. Pure functions: the same inputs always
// produce the same slots, which is what makes the booking-time recheck (5.4)
// meaningful. Nothing is cached — invalidation would have to account for
// availability, time off, and every appointment write.

import { rangesOverlap } from "./scheduling";
import {
  addDays,
  datesBetween,
  DAY_MINUTES,
  MINUTE_MS,
  zonedParts,
  zonedTimeToUtc,
} from "./time";

export interface AvailabilityWindow {
  weekday?: number;
  date?: string;
  startMinute: number;
  endMinute: number;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export interface BusyInterval {
  startAt: number;
  endAt: number;
}

export interface SlotInputs {
  timeZone: string;
  fromDate: string; // ISO YYYY-MM-DD, local to the location
  toDate: string; // inclusive
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  rules: AvailabilityWindow[];
  busy: BusyInterval[]; // time off + appointments that still hold their slot
}

export interface Slot {
  startAt: number;
  endAt: number;
  date: string; // local date
  localTime: string; // local HH:MM
}

/** Local minute-of-day to instant, rolling minutes >= 1440 into the next day.
 * Returns null for wall-clock times skipped by a DST spring-forward. */
function instantAt(
  date: string,
  minute: number,
  timeZone: string,
): number | null {
  if (minute >= DAY_MINUTES) {
    return zonedTimeToUtc(addDays(date, 1), minute - DAY_MINUTES, timeZone);
  }
  return zonedTimeToUtc(date, minute, timeZone);
}

function ruleApplies(rule: AvailabilityWindow, date: string, weekday: number) {
  if (rule.effectiveFrom && date < rule.effectiveFrom) return false;
  if (rule.effectiveTo && date > rule.effectiveTo) return false;
  return rule.date !== undefined
    ? rule.date === date
    : rule.weekday === weekday;
}

/**
 * Generates candidate slots. A candidate is kept only when the whole
 * appointment fits inside the availability window and its buffered footprint
 * touches no busy interval. Slots step by duration + buffers so consecutive
 * bookings never violate the configured gap.
 */
export function generateSlots(inputs: SlotInputs): Slot[] {
  const {
    timeZone,
    durationMinutes,
    bufferBeforeMinutes,
    bufferAfterMinutes,
    rules,
    busy,
  } = inputs;
  const step = durationMinutes + bufferBeforeMinutes + bufferAfterMinutes;
  const slots: Slot[] = [];
  if (step <= 0) return slots;

  for (const date of datesBetween(inputs.fromDate, inputs.toDate)) {
    // Midday avoids the DST edges when reading the calendar weekday.
    const noon = zonedTimeToUtc(date, 12 * 60, timeZone);
    const weekday =
      noon === null
        ? new Date(`${date}T00:00:00Z`).getUTCDay()
        : zonedParts(noon, timeZone).weekday;

    for (const rule of rules) {
      if (!ruleApplies(rule, date, weekday)) continue;
      const windowEnd = instantAt(date, rule.endMinute, timeZone);
      if (windowEnd === null) continue;

      for (
        let minute = rule.startMinute;
        minute + durationMinutes <= rule.endMinute;
        minute += step
      ) {
        const startAt = instantAt(date, minute, timeZone);
        if (startAt === null) continue; // wall-clock time skipped by DST
        const endAt = startAt + durationMinutes * MINUTE_MS;
        if (endAt > windowEnd) continue;
        const blockedFrom = startAt - bufferBeforeMinutes * MINUTE_MS;
        const blockedTo = endAt + bufferAfterMinutes * MINUTE_MS;
        if (
          busy.some((b) =>
            rangesOverlap(blockedFrom, blockedTo, b.startAt, b.endAt),
          )
        ) {
          continue;
        }
        const parts = zonedParts(startAt, timeZone);
        slots.push({
          startAt,
          endAt,
          date: parts.date,
          localTime: `${String(Math.floor(parts.minutes / 60)).padStart(2, "0")}:${String(parts.minutes % 60).padStart(2, "0")}`,
        });
      }
    }
  }
  return slots.sort((a, b) => a.startAt - b.startAt);
}
