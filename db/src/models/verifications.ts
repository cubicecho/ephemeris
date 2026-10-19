import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * A pending proof: the hash of a sign-in link's or a one-time token's value, until it is spent or expires. Owned by
 * better-auth.
 */
export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** What is being proved: the token's hash. */
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index('idx_verifications_identifier').on(t.identifier)],
);

/** A verification row as read. */
export type Verification = typeof verifications.$inferSelect;
/** A verification row as inserted. */
export type NewVerification = typeof verifications.$inferInsert;
