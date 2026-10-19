import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { relations } from '@cubicecho/ephemeris-db/relations';
import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { PGlite } from '@electric-sql/pglite';
import { pushSchema } from 'drizzle-kit/api-postgres';
import { getTableName, is, sql, Table } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import { type ExecutionResult, type GraphQLSchema, graphql } from 'graphql';
import { type AuthHost, fixedAuthHost } from '../auth/auth-host.ts';
import { type Auth, createAuth, type MagicLink } from '../auth/better-auth.ts';
import { createRateLimiter, type RateLimiter } from '../auth/rate-limit.ts';
import type { OidcConfig } from '../core/config.ts';
import type { Context } from '../core/context.ts';
import { createSchema } from '../graphql/build-schema.ts';

// A throwaway in-memory Postgres per suite. `@cubicecho/ephemeris-db` is
// deliberately never imported here — it opens a real connection at import time —
// so the schema is pulled from `@cubicecho/ephemeris-db/schema`, which is inert.

// biome-ignore lint/suspicious/noExplicitAny: db type varies by driver
export type TestDb = any;

/** Long enough for better-auth and for `AUTH_DEFAULTS.minSecretLength`, and never a real secret. */
export const TEST_SECRET = 'test-secret-0123456789abcdef0123456789';

/** One schema per database: building it is most of what a client costs, and only `db` shapes it. */
const schemas = new WeakMap<object, GraphQLSchema>();
/** One auth instance per database, for the clients that do not bring their own. */
const auths = new WeakMap<object, Auth>();

/**
 * Builds a throwaway in-memory Postgres with the app's schema pushed to it.
 *
 * @returns A Drizzle client over it.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite('memory://');
  const db = drizzle({ client, relations });
  const { apply } = await pushSchema(dbSchema as never, db as never);
  await apply();
  return db;
}

/** Every table in the schema, quoted for a statement that names them all, better-auth's among them. */
const TABLE_LIST = Object.values(dbSchema)
  .flatMap((value) => (is(value, Table) ? [`"${getTableName(value)}"`] : []))
  .join(', ');

/**
 * Empties every table, so the next test starts from the database `createTestDb` returned. A session or a pairing left
 * over from one test is state the next did not ask for.
 *
 * @param db - The test database.
 */
export async function resetTestDb(db: TestDb): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE TABLE ${TABLE_LIST} RESTART IDENTITY CASCADE`));
}

/**
 * Shuts a test database down. An instance left open holds its whole Postgres in memory until the worker exits.
 *
 * @param db - The test database.
 */
export async function closeTestDb(db: TestDb): Promise<void> {
  await db.$client.close();
}

/**
 * Creates a user straight through Drizzle. Signup is not what is under test.
 *
 * @param db - The test database.
 * @param email - The user's address.
 * @returns The new user's id.
 */
export async function createUser(db: TestDb, email: string): Promise<string> {
  const [user] = await db.insert(dbSchema.users).values({ email }).returning();
  return user.id as string;
}

/**
 * Builds the real better-auth over a test database, with sign-in links captured where production would log them.
 *
 * @param db - The test database.
 * @param [oidc] - An OIDC provider to sign in with. None by default, whatever the environment says.
 * @returns The auth instance, and the links it was asked to deliver, oldest first.
 */
export function createTestAuth(db: TestDb, oidc: OidcConfig | null = null): { auth: Auth; links: MagicLink[] } {
  const links: MagicLink[] = [];
  const auth = createAuth(db, {
    secret: TEST_SECRET,
    oidc,
    sendMagicLink: async (link) => {
      links.push(link);
    },
  });
  return { auth, links };
}

/**
 * Opens a session for a user without a link, the way SECURE_LOCAL_NET does.
 *
 * @param auth - The auth instance the session is made on.
 * @param userId - The user to sign in.
 * @returns The session token, to send as `Authorization: Bearer`.
 */
export async function createSessionToken(auth: Auth, userId: string): Promise<string> {
  const { internalAdapter } = await auth.$context;
  const session = await internalAdapter.createSession(userId);
  return session.token;
}

/**
 * Builds the headers a request carrying a session sends.
 *
 * @param token - The session token.
 * @returns The headers, with `Authorization: Bearer`.
 */
export const bearer = (token: string): Headers => new Headers({ authorization: `Bearer ${token}` });

export interface TestClient {
  /** Runs an operation as `userId`, or unauthenticated when it is null. */
  run: (query: string, variables?: Record<string, unknown>) => Promise<ExecutionResult>;
  /** Runs an operation and throws unless it succeeded, returning `data`. */
  // biome-ignore lint/suspicious/noExplicitAny: caller shapes the response
  expectOk: (query: string, variables?: Record<string, unknown>) => Promise<any>;
  /** Runs an operation, expects exactly one error, and returns it. */
  expectError: (
    query: string,
    variables?: Record<string, unknown>,
  ) => Promise<{ message: string; code: unknown; extensions: Record<string, unknown> }>;
}

/** The address test requests come from. */
export const TEST_IP = '127.0.0.1';

/** What a test client can swap out. */
export interface ClientDeps {
  /**
   * The auth instance. Pass one to share captured links between clients.
   *
   * @defaultValue One per database that captures its links and shows them to nobody.
   */
  auth?: Auth;
  /**
   * Pass one to see pairing rebuild it.
   *
   * @defaultValue A host that always hands out `auth`.
   */
  authHost?: AuthHost;
  /** The request's headers, for a field that reads the session itself (signing out). The default is none. */
  headers?: Headers;
  /** The sign-in throttle. Pass one with a small budget to reach the limit quickly. */
  limiter?: RateLimiter;
  /** The address requests appear to come from. */
  ip?: string;
}

/**
 * Builds a client that runs operations against the schema directly, with no HTTP in between.
 *
 * @param db - The test database.
 * @param userId - Who the requests come from, or null for a signed-out caller.
 * @param [deps] - Collaborators that differ from the defaults.
 * @returns The three ways to run an operation.
 */
export function createClient(db: TestDb, userId: string | null, deps: ClientDeps = {}): TestClient {
  const schema = schemas.get(db) ?? createSchema(db).schema;
  schemas.set(db, schema);
  const auth = deps.auth ?? auths.get(db) ?? createTestAuth(db).auth;
  if (deps.auth === undefined) {
    auths.set(db, auth);
  }
  const { authHost = fixedAuthHost(auth), headers = new Headers(), limiter = createRateLimiter(), ip = TEST_IP } = deps;

  const run = async (query: string, variables?: Record<string, unknown>) => {
    // Per run, as the handler does per request: a pairing may have rebuilt it since the last one.
    const contextValue: Context = { db, auth: authHost.current(), authHost, limiter, ip, headers, userId };
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
      return { message: error.message, code: error.extensions?.code, extensions: error.extensions ?? {} };
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
