import type { DB } from '@cubicecho/ephemeris-db';
import type { RateLimiter } from '../auth/rate-limit.ts';

/** What `ip` is when the request carries no address, as in a test that calls the schema directly. */
export const UNKNOWN_IP = 'unknown';

/** What every resolver, generated or hand-written, is handed. */
export interface Context {
  db: DB;
  /** The sign-in throttle. One per app, so every request counts against the same windows. */
  limiter: RateLimiter;
  /** The client's address as Express reads it. Only the real client when `TRUST_PROXY` matches the proxy in front. */
  ip: string;
  /** Who the caller is, from the request's Bearer token. Nothing downstream may take it from an argument. */
  userId: string | null;
}
