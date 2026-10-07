import type { MockLink } from '@apollo/client/testing';
import type { types } from 'graphql-mocks';
import type { RecentEntriesQuery } from '@/__generated__/graphql';
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
 * The server's exact answer to the recent-days query, for a story that pairs requests with answers.
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

/** The arguments the journal's three operations send, as far as the mocked server reads them. */
interface EntryArgs {
  where: { entryDate: { eq: string } };
}
interface EntriesArgs {
  limit?: number | null;
}
interface UpsertEntryArgs {
  values: { entryDate: string; body: string; mood?: number | null };
}

/**
 * A mocked server for a story whose subject is the page: it holds days, lists them newest first, and keeps what is
 * saved, so a page that saves and asks again sees what it wrote.
 *
 * @param written - The days it starts with.
 * @returns The resolvers, as the function `parameters.apolloClient.resolvers` takes. Each call starts from `written`.
 */
export function journalServer(written: EntryRow[]): () => types.ResolverMap {
  return () => {
    const days = new Map(written.map((row) => [row.entryDate, row]));
    return {
      Query: {
        entry: (_parent: unknown, { where }: EntryArgs) => days.get(where.entryDate.eq) ?? null,
        entries: (_parent: unknown, { limit }: EntriesArgs) =>
          [...days.values()]
            .sort((one, other) => other.entryDate.localeCompare(one.entryDate))
            .slice(0, limit ?? RECENT_LIMIT),
      },
      Mutation: {
        upsertEntry: (_parent: unknown, { values }: UpsertEntryArgs) => {
          const row: EntryRow = {
            __typename: 'Entry',
            id: `entry-${values.entryDate}`,
            entryDate: values.entryDate,
            body: values.body,
            mood: values.mood ?? null,
          };
          days.set(row.entryDate, row);
          return row;
        },
      },
    };
  };
}
