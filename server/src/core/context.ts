import type { DB } from '@cubicecho/ephemeris-db';
import type { AuthHost } from '../auth/auth-host.ts';
import type { Auth } from '../auth/better-auth.ts';
import type { RateLimiter } from '../auth/rate-limit.ts';

/** What `ip` is when the request carries no address, as in a test that calls the schema directly. */
export const UNKNOWN_IP = 'unknown';

/** What every resolver, generated or hand-written, is handed. */
export interface Context {
  db: DB;
  /** The better-auth instance for this request. The sign-in fields call `auth.api.*` on it. */
  auth: Auth;
  /** Where `auth` came from. Pairing a provider rebuilds it, so later requests get the new one. */
  authHost: AuthHost;
  /** The sign-in throttle. One per app, so every request counts against the same windows. */
  limiter: RateLimiter;
  /** The client's address as Express reads it. Only the real client when `TRUST_PROXY` matches the proxy in front. */
  ip: string;
  /** The request's headers. better-auth reads the session from them, and signing out ends it. */
  headers: Headers;
  /** Who the caller is, from the request's session. Nothing downstream may take it from an argument. */
  userId: string | null;
}
