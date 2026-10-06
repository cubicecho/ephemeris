// Getters, not constants, so a test (or a reload) sees the current environment.
import { createRequire } from 'node:module';
import { DATABASE_DEFAULTS } from '@cubicecho/ephemeris-db/defaults';
import { AUTH_DEFAULTS, ENTRY_DEFAULTS, HTTP_DEFAULTS } from './defaults.ts';

/** Env values that count as on, in lower case. */
const TRUTHY = ['1', 'true', 'yes'];
/** Env values that count as off, in lower case. */
const FALSY = ['0', 'false', 'no'];
const NODE_ENV_PRODUCTION = 'production';
const UNKNOWN_VERSION = 'unknown';

/** What tokens are signed with outside production when `JWT_SECRET` is unset. Preflight refuses it in production. */
export const DEV_SECRET = 'dev-secret-change-in-production';

/**
 * Lower-cases and trims a raw env value.
 *
 * @param value - The raw env value.
 * @returns The word to compare, or an empty string when unset.
 */
function normalise(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

/**
 * Reads a flag that is off unless switched on.
 *
 * @param value - The raw env value. "1", "true" and "yes" count as on, in any case. Any other word is off.
 * @param fallback - Used when the value is unset or empty.
 * @returns Whether the flag is on.
 */
export function envFlag(value: string | undefined, fallback: boolean): boolean {
  const normalised = normalise(value);
  if (normalised === '') {
    return fallback;
  }
  return TRUTHY.includes(normalised);
}

/**
 * Reads a flag that is on unless switched off, so a typo never turns a protection off.
 *
 * @param value - The raw env value. "0", "false" and "no" count as off, in any case. Any other word is on.
 * @param fallback - Used when the value is unset or empty.
 * @returns Whether the flag is on.
 */
function envUnlessDisabled(value: string | undefined, fallback: boolean): boolean {
  const normalised = normalise(value);
  if (normalised === '') {
    return fallback;
  }
  return FALSY.includes(normalised) === false;
}

/**
 * Reads a positive number.
 *
 * @param value - The raw env value.
 * @param fallback - Used when the value is unset, not a number, or not above zero.
 * @returns The number.
 */
function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  const isUsable = Number.isFinite(parsed) && parsed > 0;
  return isUsable ? parsed : fallback;
}

/**
 * Whether this is a production run. Preflight is stricter, GraphiQL is off and magic links stay out of responses.
 *
 * @returns True when `NODE_ENV` is "production".
 */
export const isProduction = (): boolean => process.env.NODE_ENV === NODE_ENV_PRODUCTION;

/**
 * Whether typing an email signs in. Unsafe on a public network: on only where nothing hostile can reach the port.
 *
 * @returns `SECURE_LOCAL_NET` as a flag, or `AUTH_DEFAULTS.secureLocalNet`.
 */
export const secureLocalNet = (): boolean => envFlag(process.env.SECURE_LOCAL_NET, AUTH_DEFAULTS.secureLocalNet);

/**
 * Whether signing in requires following a magic link at all.
 *
 * @returns False under `SECURE_LOCAL_NET=true` or the narrower `AUTH_MAGIC_LINK=false`, otherwise `AUTH_DEFAULTS.magicLinkRequired`.
 *
 * @remarks
 * Off, `requestMagicLink` hands back a live session for whatever address it is given. Never off on an instance the
 * internet can reach: the email address becomes the entire credential.
 */
export const magicLinkRequired = (): boolean =>
  secureLocalNet() === false && envUnlessDisabled(process.env.AUTH_MAGIC_LINK, AUTH_DEFAULTS.magicLinkRequired);

/**
 * Whether the magic link is returned in the API response rather than only logged. Unsafe on a public network.
 *
 * @returns True outside production, or when `EXPOSE_MAGIC_LINK` is on.
 */
export const magicLinkExposed = (): boolean =>
  isProduction() === false || envFlag(process.env.EXPOSE_MAGIC_LINK, false);

/**
 * The secret session and magic-link tokens are signed with.
 *
 * @returns `JWT_SECRET`, or `DEV_SECRET` when unset.
 */
export const jwtSecret = (): string => process.env.JWT_SECRET ?? DEV_SECRET;

/**
 * The port to listen on.
 *
 * @returns `PORT`, or `HTTP_DEFAULTS.port`.
 */
export const port = (): number => envNumber(process.env.PORT, HTTP_DEFAULTS.port);

/**
 * Where users reach this instance. Magic links are built from it, and it is logged at boot.
 *
 * @returns `APP_URL`, or localhost on the listen port, which is only right for someone browsing from this machine.
 */
export const appUrl = (): string => process.env.APP_URL ?? `http://localhost:${port()}`;

/**
 * Largest entry body accepted, in characters. A cap on a text column anyone signed in may write to.
 *
 * @returns `MAX_BODY_CHARS`, or `ENTRY_DEFAULTS.maxBodyLength`.
 */
export const maxBodyChars = (): number => envNumber(process.env.MAX_BODY_CHARS, ENTRY_DEFAULTS.maxBodyLength);

/**
 * How long boot waits for Postgres before exiting.
 *
 * @returns `DB_CONNECT_TIMEOUT_MS`, or `DATABASE_DEFAULTS.connectTimeoutMs`, in milliseconds.
 */
export const dbConnectTimeoutMs = (): number =>
  envNumber(process.env.DB_CONNECT_TIMEOUT_MS, DATABASE_DEFAULTS.connectTimeoutMs);

/**
 * Reads the version semantic-release stamped into the root package.json, which the Dockerfile copies.
 *
 * @returns The released version, or "unknown".
 */
function readVersion(): string {
  try {
    const manifest: { version?: string } = createRequire(import.meta.url)('../../../package.json');
    return manifest.version || UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

/** Stamped into the build, not configured. */
const VERSION = readVersion();

/**
 * The version this build was released as.
 *
 * @returns The released version, or "unknown".
 */
export const version = (): string => VERSION;
