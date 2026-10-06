import type { ContextValuesConfig, RowScope, SchemaFeatures, ScopeConfig } from '@vantreeseba/drizzle-graphql';
import { eq } from 'drizzle-orm';
import type { Context } from '../core/context.ts';
import { requireAuth } from '../core/errors.ts';

// Multi-tenancy, expressed as drizzle-graphql configuration rather than as
// resolver wrappers. `scope` is ANDed into the SQL of every read, update and
// delete the library generates — list and single queries, aggregates, relation
// fields — after the client's own `where`, so a client filter can only ever
// narrow it. `contextValues` is the write-side half: it takes `userId` out of
// every create and update input and stamps it from the request, so ownership is
// never something a caller states.
//
// The rule for anyone adding a table: it needs an entry here, or its rows are
// visible across tenants. __tests__/tenancy.test.ts fails when one is missing.

const USERS_TABLE = 'users';

export const USER_OWNED_TABLES = ['entries'] as const;

/** Every table drizzle-graphql will generate fields for. */
export const ALL_TABLES = [USERS_TABLE, ...USER_OWNED_TABLES] as const;

const scopeByUserId: RowScope<Context> = (context, table) => eq(table.userId, requireAuth(context));

export const scope: ScopeConfig<Context> = {
  // A user row is only ever visible to its owner. There is no directory here.
  [USERS_TABLE]: (context, table) => eq(table.id, requireAuth(context)),
  ...Object.fromEntries(USER_OWNED_TABLES.map((name) => [name, scopeByUserId])),
};

/**
 * Columns the server owns: removed from every create and update input, stamped
 * from the request on insert. This is what makes `userId` unstatable rather than
 * merely overwritten — and it is what lets `upsertEntry`'s conflict target name
 * `userId` without a client ever supplying one.
 */
export const contextValues: ContextValuesConfig<Context> = Object.fromEntries(
  USER_OWNED_TABLES.map((name) => [name, { userId: (context: Context) => requireAuth(context) }]),
);

/**
 * `users` writes belong to the auth flow (auth/resolvers.ts): an account exists
 * because a sign-in created it, and there is nothing else about a user to edit.
 * Everything `entries` needs is generated CRUD plus the upsert.
 */
const generatedWritesAllowed = (table: string): boolean => table !== USERS_TABLE;

export const features: SchemaFeatures = {
  insert: generatedWritesAllowed,
  update: generatedWritesAllowed,
  updateMany: generatedWritesAllowed,
  delete: generatedWritesAllowed,
  // The whole reason there is no hand-written `saveEntry`. Writing a journal is
  // "this is what I have for today", not "create, unless it exists, in which
  // case update" — and the client cannot tell those apart without a round trip
  // it would then race against itself.
  upsert: generatedWritesAllowed,
};
