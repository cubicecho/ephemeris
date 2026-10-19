import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { getTableName, is, Table } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { ALL_TABLES, AUTH_TABLES, contextValues, exclude, SERVER_TABLES, scope } from '../../graphql/tenancy.ts';

// The test that fails when someone adds a table and forgets tenancy. `scope` is
// what confines every generated read, update and delete to the caller; a table
// missing from it is readable across tenants, and nothing else in the codebase
// would say so.

/** better-auth's tables and the server's own, which the API never serves. */
const UNSERVED_TABLES = [...AUTH_TABLES, ...SERVER_TABLES];
const UNSERVED_TABLE_NAMES = new Set<string>(UNSERVED_TABLES);

/** Every table in the Drizzle schema, by its export name. */
const allTableKeys = Object.entries(dbSchema)
  .filter(([, value]) => is(value, Table))
  .map(([key]) => key);
/** The tables the API serves. */
const tableKeys = allTableKeys.filter((key) => UNSERVED_TABLE_NAMES.has(key) === false);

describe('tenancy configuration', () => {
  it('finds the tables', () => {
    expect(tableKeys.sort()).toEqual(['entries', 'users']);
  });

  it('lists every served table', () => {
    // A table left out of ALL_TABLES has no API at all: the opposite failure to a missing scope, and as silent.
    expect([...ALL_TABLES].sort()).toEqual(tableKeys.sort());
  });

  it('excludes every auth and server table, and finds each one in the schema', () => {
    // A name here that matches no table excludes nothing, and the table it meant is served unscoped.
    expect(exclude.tables).toEqual(UNSERVED_TABLES);
    const found = allTableKeys.filter((key) => UNSERVED_TABLE_NAMES.has(key));
    expect(found.sort()).toEqual([...UNSERVED_TABLES].sort());
  });

  it.each(tableKeys)('scopes %s to the caller', (key) => {
    expect(scope[key]).toBeTypeOf('function');
  });

  it.each(tableKeys.filter((key) => key !== 'users'))('stamps userId on %s rather than accepting it', (key) => {
    expect(contextValues[key]?.userId).toBeTypeOf('function');
  });

  it('names every table by its Drizzle key, not its SQL name', () => {
    // scope is keyed by the schema export name; getting this wrong silently
    // scopes nothing, since an unknown key is simply never consulted.
    for (const [key, value] of Object.entries(dbSchema)) {
      const isUnserved = is(value, Table) === false || UNSERVED_TABLE_NAMES.has(key);
      if (isUnserved) {
        continue;
      }
      expect(Object.keys(scope)).toContain(key);
      expect(getTableName(value)).toBeTypeOf('string');
    }
  });
});
