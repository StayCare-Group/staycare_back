import { AppError } from "./AppError";

/**
 * The business operates physically in Malta. Dates are stored in UTC, but
 * every "day" the user filters by (reports, dashboards) is a calendar day in
 * this timezone.
 */
export const BUSINESS_TIMEZONE = "Europe/Malta";

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

const businessClock = new Intl.DateTimeFormat("en-US", {
  timeZone: BUSINESS_TIMEZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

function parseCalendarDate(value: string): CalendarDate | null {
  const match = CALENDAR_DATE_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Reject impossible dates such as 2026-02-30 (Date.UTC would roll them over).
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

/** True when `value` is a real calendar date formatted as YYYY-MM-DD. */
export function isValidCalendarDate(value: string): boolean {
  return parseCalendarDate(value) !== null;
}

/**
 * Number of calendar days between two YYYY-MM-DD dates, inclusive.
 * Both dates must be valid.
 */
export function countCalendarDaysInclusive(from: string, to: string): number {
  const start = requireCalendarDate(from);
  const end = requireCalendarDate(to);
  const diff =
    Date.UTC(end.year, end.month - 1, end.day) -
    Date.UTC(start.year, start.month - 1, start.day);
  return Math.round(diff / MS_PER_DAY) + 1;
}

function requireCalendarDate(value: string): CalendarDate {
  const parsed = parseCalendarDate(value);
  if (!parsed) {
    throw new AppError(`Invalid date "${value}". Expected YYYY-MM-DD.`, 400);
  }
  return parsed;
}

/** Offset (ms) of the business timezone from UTC at the given instant. */
function getBusinessOffsetMs(instantMs: number): number {
  const parts = businessClock.formatToParts(new Date(instantMs));
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value);

  const wallClockAsUtc = Date.UTC(
    read("year"),
    read("month") - 1,
    read("day"),
    read("hour"),
    read("minute"),
    read("second"),
  );
  return wallClockAsUtc - instantMs;
}

/** UTC instant at which the given calendar day starts (00:00) in the business timezone. */
function startOfBusinessDayUtc({ year, month, day }: CalendarDate): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day);
  const firstGuess = wallClockAsUtc - getBusinessOffsetMs(wallClockAsUtc);
  // Re-evaluate the offset at the guess so days around a DST change resolve correctly.
  return new Date(wallClockAsUtc - getBusinessOffsetMs(firstGuess));
}

export interface UtcDateRange {
  /** Inclusive start (first instant of `from` in Malta). */
  start: Date;
  /** Exclusive end (first instant of the day after `to` in Malta). */
  endExclusive: Date;
}

/**
 * Converts an inclusive range of business calendar days (YYYY-MM-DD) into the
 * UTC half-open interval `[start, endExclusive)` to use against UTC columns:
 *
 *   created_at >= start AND created_at < endExclusive
 */
export function getBusinessDateRangeUtc(from: string, to: string): UtcDateRange {
  const start = requireCalendarDate(from);
  const end = requireCalendarDate(to);

  const dayAfterEnd = new Date(Date.UTC(end.year, end.month - 1, end.day + 1));

  return {
    start: startOfBusinessDayUtc(start),
    endExclusive: startOfBusinessDayUtc({
      year: dayAfterEnd.getUTCFullYear(),
      month: dayAfterEnd.getUTCMonth() + 1,
      day: dayAfterEnd.getUTCDate(),
    }),
  };
}

