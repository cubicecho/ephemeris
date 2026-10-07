import type { MockLink } from '@apollo/client/testing';
import type { JournalDayQuery, RecentEntriesQuery } from '@/__generated__/graphql';
import { JournalDay } from '@/components/entries/entry-form';
import { RECENT_LIMIT, RecentEntries } from '@/components/entries/recent-days';
import { shiftDays, todayIso } from '@/lib/date';

/** One day as the server returns it. */
export type EntryRow = RecentEntriesQuery['entries'][number];

/** The viewport global for a story drawn at the width that has a sidebar. */
export const DESKTOP = { viewport: { value: 'desktop', isRotated: false } };

/**
 * A written day, counted back from today so a story reads "Today" and "Yesterday" whenever it runs.
 *
 * @param daysAgo - 0 for today, 1 for yesterday.
 * @param body - The day's words.
 * @param mood - 1 to 5, or null for a day with none recorded.
 * @returns The row, with an id made from its date.
 */
export function entryRow(daysAgo: number, body: string, mood: number | null): EntryRow {
  const entryDate = shiftDays(todayIso(), -daysAgo);
  return { __typename: 'Entry', id: `entry-${entryDate}`, entryDate, body, mood };
}

/** Three days: today, yesterday with no mood and no words, and one last week. */
export const SOME_DAYS: EntryRow[] = [
  entryRow(0, 'Walked to the harbour before work.', 4),
  entryRow(1, '', null),
  entryRow(6, 'Rain all day. Stayed in and read.', 2),
];

/**
 * The server's answer to the recent-days query.
 *
 * @param entries - The days it returns, newest first.
 * @returns A mock that answers once.
 */
export function recentDaysMock(entries: EntryRow[]): MockLink.MockedResponse {
  return { request: { query: RecentEntries, variables: { limit: RECENT_LIMIT } }, result: { data: { entries } } };
}

/**
 * The server failing the recent-days query.
 *
 * @returns A mock that fails once, as a dropped connection does.
 */
export function recentDaysFailure(): MockLink.MockedResponse {
  return { request: { query: RecentEntries, variables: { limit: RECENT_LIMIT } }, error: new Error('Failed to fetch') };
}

/**
 * The server's answer to one day's query.
 *
 * @param date - The day asked for.
 * @param entry - What it holds, or null for a day nothing was written on.
 * @returns A mock that answers once.
 */
export function journalDayMock(date: string, entry: JournalDayQuery['entry']): MockLink.MockedResponse {
  return { request: { query: JournalDay, variables: { date } }, result: { data: { entry: entry ?? null } } };
}
