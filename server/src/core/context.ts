import type { DB } from '@cubicecho/ephemeris-db';

/**
 * What every resolver — generated or hand-written — is handed. `userId` is the
 * only thing that says who the caller is: it comes from the request's Bearer
 * token and nothing downstream may take it from an argument.
 */
export interface Context {
  db: DB;
  userId: string | null;
}
