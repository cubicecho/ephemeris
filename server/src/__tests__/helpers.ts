import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { relations } from '@cubicecho/ephemeris-db/relations';
import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { PGlite } from '@electric-sql/pglite';
import { pushSchema } from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/pglite';
import { type ExecutionResult, graphql } from 'graphql';
import { createRateLimiter, type RateLimiter } from '../auth/rate-limit.ts';
import type { Context } from '../core/context.ts';
import { createSchema } from '../graphql/build-schema.ts';

// A throwaway in-memory Postgres per suite. `@cubicecho/ephemeris-db` is
// deliberately never imported here — it opens a real connection at import time —
// so the schema is pulled from `@cubicecho/ephemeris-db/schema`, which is inert.

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver
export type TestDb = any;

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite('memory://');
  const db = drizzle({ client, relations });
  const { apply } = await pushSchema(dbSchema as never, db as never);
  await apply();
  return db;
}

/** A user row created straight through Drizzle — signup is not what is under test. */
export async function createUser(db: TestDb, email: string): Promise<string> {
  const [user] = await db.insert(dbSchema.users).values({ email }).returning();
  return user.id as string;
}

export interface TestClient {
  /** Runs an operation as `userId`, or unauthenticated when it is null. */
  run: (query: string, variables?: Record<string, unknown>) => Promise<ExecutionResult>;
  /** Runs an operation and throws unless it succeeded, returning `data`. */
  // biome-ignore lint/suspicious/noExplicitAny: caller shapes the response
  expectOk: (query: string, variables?: Record<string, unknown>) => Promise<any>;
  /** Runs an operation, expects exactly one error, and returns it. */
  expectError: (query: string, variables?: Record<string, unknown>) => Promise<{ message: string; code: unknown }>;
}

/** The address test requests come from. */
export const TEST_IP = '127.0.0.1';

/** What a test client can swap out. */
export interface ClientDeps {
  /** The sign-in throttle. Pass one with a small budget to reach the limit quickly. */
  limiter?: RateLimiter;
  /** The address requests appear to come from. */
  ip?: string;
}

export function createClient(db: TestDb, userId: string | null, deps: ClientDeps = {}): TestClient {
  const { schema } = createSchema(db);
  const { limiter = createRateLimiter(), ip = TEST_IP } = deps;

  const run = async (query: string, variables?: Record<string, unknown>) => {
    const contextValue: Context = { db, limiter, ip, userId };
    return graphql({ schema, source: query, contextValue, variableValues: variables });
  };

  return {
    run,
    expectOk: async (query, variables) => {
      const result = await run(query, variables);
      // graphql masks a thrown non-GraphQLError as "Internal server error";
      // surface the original so a broken test reads as the bug it is.
      if (result.errors?.length) {
        const [first] = result.errors;
        throw first.originalError ?? new Error(result.errors.map((error) => error.message).join('; '));
      }
      return result.data;
    },
    expectError: async (query, variables) => {
      const result = await run(query, variables);
      const error = result.errors?.[0];
      if (!error) {
        throw new Error('expected an error, got a successful result');
      }
      return { message: error.message, code: error.extensions?.code };
    },
  };
}

/**
 * Reads the port a test server was given when it listened on port 0.
 *
 * @param server - A listening server.
 * @returns The port it is bound to.
 */
export function portOf(server: Server): number {
  const address = server.address() as AddressInfo;
  return address.port;
}
