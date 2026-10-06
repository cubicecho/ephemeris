// A journal day is a calendar day in the writer's own life, so every date here
// is a `YYYY-MM-DD` string in the *browser's* timezone and never an instant.
//
// The trap this file exists to avoid: `new Date('2026-09-15')` parses as UTC
// midnight, which is 2026-09-14 for anyone west of Greenwich. Every conversion
// below goes through the local calendar parts instead.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toIso(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The local date `YYYY-MM-DD` behind a calendar-day string. */
function fromIso(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayIso(): string {
  return toIso(new Date());
}

/**
 * Whether a string is a real calendar day, not merely `\d{4}-\d{2}-\d{2}`.
 * `2026-02-31` matches the shape; `Date` rolls it to March, which is how it is
 * caught here.
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

export function shiftDays(iso: string, days: number): string {
  const date = fromIso(iso);
  date.setDate(date.getDate() + days);
  return toIso(date);
}

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
const withYear = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

/** "Today", "Yesterday", or the weekday and date — what the page is titled. */
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

/** The unambiguous form, for a list where every row needs its own year. */
export function formatFullDate(iso: string): string {
  return withYear.format(fromIso(iso));
}
