// A journal day is a calendar day in the writer's own life, so every date here
// is a `YYYY-MM-DD` string in the *browser's* timezone and never an instant.
//
// The trap this file exists to avoid: `new Date('2026-09-15')` parses as UTC
// midnight, which is 2026-09-14 for anyone west of Greenwich. Every conversion
// below goes through the local calendar parts instead.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Writes a date as the calendar day it is locally.
 *
 * @param date - Any instant.
 * @returns That instant's local day as `YYYY-MM-DD`.
 */
function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Reads a calendar-day string as a local date.
 *
 * @param iso - A day as `YYYY-MM-DD`.
 * @returns Local midnight on that day.
 */
function fromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Today, by the browser's clock and timezone.
 *
 * @returns The day as `YYYY-MM-DD`.
 */
export function todayIso(): string {
  return toIso(new Date());
}

/**
 * Whether a string is a real calendar day, not merely `\d{4}-\d{2}-\d{2}`.
 *
 * `2026-02-31` matches the shape; `Date` rolls it to March, which is how it is caught here.
 *
 * @param value - What a URL or an input offered as a day.
 * @returns true for a day that exists on the calendar.
 */
export function isValidIsoDate(value: string | undefined): value is string {
  if (!value) {
    return false;
  }
  const isMalformed = ISO_DATE.test(value) === false;
  if (isMalformed) {
    return false;
  }
  return toIso(fromIso(value)) === value;
}

/**
 * Moves a day along the calendar.
 *
 * @param iso - The day to start from, as `YYYY-MM-DD`.
 * @param days - How many days later. Negative for earlier.
 * @returns The day arrived at, as `YYYY-MM-DD`.
 */
export function shiftDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const withYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Names a day the way the page is titled.
 *
 * @param iso - The day, as `YYYY-MM-DD`.
 * @returns "Today", "Yesterday", or the weekday and date.
 */
export function formatDay(iso: string): string {
  const today = todayIso();
  if (iso === today) {
    return 'Today';
  }
  if (iso === shiftDays(today, -1)) {
    return 'Yesterday';
  }
  return longDate.format(fromIso(iso));
}

/**
 * Names a day unambiguously, for a list where every row needs its own year.
 *
 * @param iso - The day, as `YYYY-MM-DD`.
 * @returns The day, month and year in the browser's locale.
 */
export function formatFullDate(iso: string): string {
  return withYear.format(fromIso(iso));
}
