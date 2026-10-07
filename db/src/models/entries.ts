import { sql } from 'drizzle-orm';
import { check, date, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.ts';

/**
 * One journal entry per person per day.
 *
 * `entryDate` is a `date`, not a timestamp, and it is stored as a string: a
 * journal day is a calendar day in the writer's own life, not an instant. A
 * timestamp would put "yesterday" in a different day for the same person on a
 * plane, and there is no server-side timezone worth guessing from.
 *
 * `mood` is a 1–5 integer and is nullable, because a day someone wrote about
 * without rating is not an incomplete entry. It is the one structured column
 * here on purpose — it is what the dashboard and eunomia will eventually
 * correlate against, and free text is not something they can average.
 *
 * `integer` rather than the `smallint` the range would justify: drizzle-graphql
 * gives `smallint` a `Float` in the schema and `integer` an `Int`, and a mood of
 * 3.5 that typechecks is a worse trade than two bytes a row.
 */
export const entries = pgTable(
  'entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    entryDate: date('entry_date', { mode: 'string' }).notNull(),
    body: text('body').notNull().default(''),
    mood: integer('mood'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // The upsert conflict target, and the invariant it enforces: one entry per
    // day. A second write for a day the person already wrote about has to be an
    // edit, never a second row, or "how did I feel on Tuesday" has two answers.
    // Its index also serves every "this writer's days, by date" read, so there is no second one.
    unique('uq_entries_user_date').on(t.userId, t.entryDate),
    // The range is checked in the resolver too, for a readable message. This is
    // the one that still holds for a write that did not come through GraphQL.
    check('ck_entries_mood_range', sql`${t.mood} is null or (${t.mood} between 1 and 5)`),
  ],
);

export type Entry = typeof entries.$inferSelect;
export type NewEntry = typeof entries.$inferInsert;
