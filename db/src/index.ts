import { DATABASE_DEFAULTS } from './defaults.ts';
import { relations } from './relations.ts';
import * as schema from './schema.ts';
import { requiresSsl } from './ssl.ts';

// Postgres-only, with no embedded fallback: writing somewhere else would hide a missing URL until the data mattered.
const url = process.env.DATABASE_URL ?? '';
if (url === '') {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env and run `npm run db:up` for a local Postgres.');
}

const isProduction = process.env.NODE_ENV === 'production';
const mustForceSsl = isProduction && requiresSsl(url);
const { drizzle } = await import('drizzle-orm/postgres-js');

/** The app's Drizzle client. Doesn't connect until the first query. */
export const db = drizzle({
  connection: {
    url,
    ...(mustForceSsl ? { ssl: 'require' } : {}),
    // Idempotent migrations emit a NOTICE on every boot, which reads like a failure.
    onnotice: () => {},
  },
  relations,
});
export type DB = typeof db;

/**
 * Closes the pool at shutdown, after the server has drained.
 *
 * @returns Resolves once every connection is closed. Queries still running are cancelled after `closeTimeoutSeconds`.
 */
export const closeDatabase = (): Promise<void> => db.$client.end({ timeout: DATABASE_DEFAULTS.closeTimeoutSeconds });

export * from './schema.ts';
export { relations, schema };
