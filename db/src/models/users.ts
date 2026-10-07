import { pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/** One account per email address. Created by the first sign-in: there is nothing else about a user to edit. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased and trimmed (auth/resolvers.ts), so the unique constraint is case-insensitive in effect. */
    email: text('email').notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique('uq_users_email').on(t.email)],
);

/** A user row as read. */
export type User = typeof users.$inferSelect;
/** A user row as inserted. */
export type NewUser = typeof users.$inferInsert;
