import { type AnyDrizzleDB, buildSchema, type GeneratedEntities } from '@vantreeseba/drizzle-graphql';
import type { GraphQLSchema } from 'graphql';
import { applyAuthExtension } from '../auth/resolvers.ts';
import { OPERATION_LIMIT_DEFAULTS } from '../core/defaults.ts';
import { entryWriteHooks } from '../entries/hooks.ts';
import { contextValues, features, scope } from './tenancy.ts';

// The whole CRUD surface is generated from the Drizzle schema — there are no
// hand-written create/read/update/delete resolvers, and adding a column to a
// table is all it takes to expose it. Only the auth flow, which is not CRUD over
// anything, is written by hand.
//
// Kept separate from schema.ts, which binds it to the real database, so a test
// can build the same schema against a throwaway one.

/** Any Drizzle client: postgres-js in production, PGlite in tests. */
type AnyDb = AnyDrizzleDB<Record<string, unknown>>;

/** What `createSchema` hands back. */
export interface BuiltSchema {
  schema: GraphQLSchema;
  /** drizzle-graphql's generated types and resolvers, for hand-built roots. */
  entities: GeneratedEntities<AnyDb>;
}

/**
 * Builds the served schema. Kept apart from schema.ts so tests can bind a throwaway db.
 *
 * @param db - Drizzle client.
 * @returns The schema and drizzle-graphql's generated entities.
 */
export function createSchema(db: AnyDb): BuiltSchema {
  const { schema: drizzleSchema, entities } = buildSchema(db, {
    prefixes: {
      insert: 'create',
      update: 'update',
      delete: 'delete',
    },
    // Table keys are plural (`entries`); derive singular names for the type and
    // single-row fields (Entry, entry, upsertEntry).
    typeNameMapper: 'singularize',
    // Multi-tenancy lives in the generated SQL, not in resolver wrappers.
    scope,
    contextValues,
    features,
    onWrite: { ...entryWriteHooks },
    // Every list, root or relation, gets a page size.
    limits: {
      defaultLimit: OPERATION_LIMIT_DEFAULTS.defaultPageSize,
      maxLimit: OPERATION_LIMIT_DEFAULTS.maxPageSize,
    },
    // Publishes each field's cost for useOperationLimits. On by default, and stated so nobody turns it off.
    complexity: true,
  });

  const schema = applyAuthExtension(drizzleSchema);

  return { schema, entities };
}
