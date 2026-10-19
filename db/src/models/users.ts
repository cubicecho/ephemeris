import { boolean, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * One account per email address, created by its first sign-in: a link, SECURE_LOCAL_NET or an OIDC provider. Owned by
 * better-auth, which reads and writes every column but `isAdmin`. There is nothing else about a user to edit.
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Stored lower-cased and trimmed by better-auth, so the unique constraint is case-insensitive in effect. */
    email: text('email').notNull(),
    name: text('name'),
    /** false until a sign-in link or a provider has proved the address. better-auth reads and writes it. */
    emailVerified: boolean('email_verified').notNull().default(false),
    /** better-auth's column for a picture. Ephemeris shows none. */
    image: text('image'),
    /** Whether this account may change how people sign in (pair an OIDC provider). The first account is. */
    isAdmin: boolean('is_admin').notNull().default(false),
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
