import type { BuildSchemaConfig, RowScope } from '@vantreeseba/drizzle-graphql';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../auth/resolvers.ts';
import type { Context } from '../core/context.ts';

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

// biome-ignore lint/suspicious/noExplicitAny: drizzle-orm 1.0 table/column type compat
type AnyTable = any;

export const USER_OWNED_TABLES = ['entries'] as const;

/** Every table drizzle-graphql will generate fields for. */
export const ALL_TABLES = ['users', ...USER_OWNED_TABLES] as const;

const scopeByUserId: RowScope<Context> = (context, table) => eq((table as AnyTable).userId, requireAuth(context));

export const scope: NonNullable<BuildSchemaConfig['scope']> = {
  // A user row is only ever visible to its owner. There is no directory here.
  users: (context, table) => eq((table as AnyTable).id, requireAuth(context as Context)),
  ...Object.fromEntries(USER_OWNED_TABLES.map((name) => [name, scopeByUserId])),
};

/**
 * Columns the server owns: removed from every create and update input, stamped
 * from the request on insert. This is what makes `userId` unstatable rather than
 * merely overwritten — and it is what lets `upsertEntry`'s conflict target name
 * `userId` without a client ever supplying one.
 */
export const contextValues: NonNullable<BuildSchemaConfig['contextValues']> = Object.fromEntries(
  USER_OWNED_TABLES.map((name) => [name, { userId: (context: Context) => requireAuth(context) }]),
);

/**
 * `users` writes belong to the auth flow (auth/resolvers.ts): an account exists
 * because a sign-in created it, and there is nothing else about a user to edit.
 * Everything `entries` needs is generated CRUD plus the upsert.
 */
const generatedWritesAllowed = (table: string) => table !== 'users';

export const features: NonNullable<BuildSchemaConfig['features']> = {
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
