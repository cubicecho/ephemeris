import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatDay, isValidIsoDate, shiftDays, todayIso } from './date.ts';

// These run under a timezone west of Greenwich on purpose: it is where the
// `new Date('2026-09-15')`-is-UTC-midnight bug shows up as an off-by-one day.

describe('todayIso', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads the local day, not the UTC one', () => {
    // An instant that is a different calendar day either side of Greenwich:
    // 05:00 UTC on the 16th is still the evening of the 15th in the Americas.
    vi.setSystemTime(new Date('2026-09-16T05:00:00Z'));
    // en-CA is ISO order, and Intl resolves it in the runner's own zone — so
    // this fails if `todayIso` ever reaches for a UTC getter.
    const local = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
      new Date(),
    );
    expect(todayIso()).toBe(local);
  });

  it('turns the day over at local midnight', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 23, 59, 59));
    expect(todayIso()).toBe('2026-09-15');
    vi.setSystemTime(new Date(2026, 8, 16, 0, 0, 1));
    expect(todayIso()).toBe('2026-09-16');
  });
});

describe('isValidIsoDate', () => {
  it.each(['2026-09-15', '2024-02-29', '2026-01-01'])('accepts %s', (value) => {
    expect(isValidIsoDate(value)).toBe(true);
  });

  it.each(['2026-02-31', '2026-13-01', '2026-9-15', 'today', '', undefined])('rejects %s', (value) => {
    expect(isValidIsoDate(value)).toBe(false);
  });
});

describe('shiftDays', () => {
  it('crosses a month boundary', () => {
    expect(shiftDays('2026-09-01', -1)).toBe('2026-08-31');
    expect(shiftDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('crosses a year boundary', () => {
    expect(shiftDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(shiftDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(shiftDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('is stable across a daylight-saving change', () => {
    // Stepping a day at a time through the US spring-forward: a naive
    // `+86_400_000` lands at 23:00 the same day and repeats it.
    let day = '2026-03-07';
    const seen = [day];
    for (let i = 0; i < 4; i++) {
      day = shiftDays(day, 1);
      seen.push(day);
    }
    expect(seen).toEqual(['2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10', '2026-03-11']);
  });
});

describe('formatDay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 15, 12));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('names the two days that have names', () => {
    expect(formatDay('2026-09-15')).toBe('Today');
    expect(formatDay('2026-09-14')).toBe('Yesterday');
  });

  it('spells out anything older', () => {
    expect(formatDay('2026-09-13')).toMatch(/13/);
    expect(formatDay('2026-09-13')).not.toMatch(/Today|Yesterday/);
  });
});
