// Getters, not constants, so a test (or a reload) sees the current environment.
import { createRequire } from 'node:module';
import { DATABASE_DEFAULTS } from '@cubicecho/ephemeris-db/defaults';
import { AUTH_DEFAULTS, type AuthSettings, ENTRY_DEFAULTS, HTTP_DEFAULTS } from './defaults.ts';

/** Env values that count as on, in lower case. */
const TRUTHY = ['1', 'true', 'yes'];
/** Env values that count as off, in lower case. */
const FALSY = ['0', 'false', 'no'];
const NODE_ENV_PRODUCTION = 'production';
const UNKNOWN_VERSION = 'unknown';
/** The two words `TRUST_PROXY` takes besides a hop count or a subnet list. */
const TRUST_PROXY_OFF = 'false';
const TRUST_PROXY_ON = 'true';
/** A whole number of proxy hops. */
const HOP_COUNT = /^\d+$/;
/** The slashes a URL may end in, which every URL here is compared and joined without. */
const TRAILING_SLASHES = /\/+$/;

/** What better-auth signs with outside production when no secret is set. Preflight refuses it in production. */
export const DEV_SECRET = 'dev-secret-change-in-production';
/** The value `.env.example` ships. Public, so as good as no secret at all. */
export const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string';

/**
 * Why `secret` must not sign production sessions, or undefined when it may.
 *
 * @param secret - The secret as set.
 * @returns The reason, as the end of a sentence ("is not set").
 *
 * @remarks
 * better-auth signs with this and nothing else, so a secret that is published or short enough to guess lets anyone
 * forge what it signs: the OIDC state cookie among them.
 */
export function describeWeakSecret(secret: string | undefined): string | undefined {
  if (secret === undefined || secret === '') {
    return 'is not set';
  }
  if (secret === DEV_SECRET || secret === PLACEHOLDER_SECRET) {
    return 'is a published default';
  }
  if (secret.length < AUTH_DEFAULTS.minSecretLength) {
    return `is shorter than ${AUTH_DEFAULTS.minSecretLength} characters`;
  }
  return undefined;
}

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
 * Whether a public `APP_URL` is accepted alongside a sign-in that needs no link.
 *
 * @returns `I_KNOW_SECURE_LOCAL_NET_IS_PUBLIC` as a flag, off when unset.
 */
export const allowsPublicLocalNet = (): boolean => envFlag(process.env.I_KNOW_SECURE_LOCAL_NET_IS_PUBLIC, false);

/**
 * Whether signing in requires following a magic link at all.
 *
 * @returns False under `SECURE_LOCAL_NET=true` or the narrower `AUTH_MAGIC_LINK=false`, otherwise `AUTH_DEFAULTS.magicLinkRequired`.
 *
 * @remarks
 * Off, `signInMagicLink` hands back a live session for whatever address it is given. Never off on an instance the
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
 * The signing secret exactly as set, for preflight to judge.
 *
 * @returns `BETTER_AUTH_SECRET`, or the older `JWT_SECRET` an instance from before better-auth was set up with, or
 *   undefined when neither is set.
 */
export const configuredAuthSecret = (): string | undefined =>
  process.env.BETTER_AUTH_SECRET || process.env.JWT_SECRET || undefined;

/**
 * What better-auth signs with. Read at call time, so a test sees the environment it set.
 *
 * @returns The configured secret, or `DEV_SECRET` when unset, so development needs no .env entry.
 */
export const authSecret = (): string => configuredAuthSecret() ?? DEV_SECRET;

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
export const appUrl = (): string => (process.env.APP_URL ?? `http://localhost:${port()}`).replace(TRAILING_SLASHES, '');

/**
 * Where a browser reaches this server: the OIDC sign-in's start and callback live here.
 *
 * @returns `SERVER_URL`, `APP_URL` in production (the server serves the app, so they are one origin), or this
 *   server's own localhost address in development, where Vite serves the app from a port of its own.
 */
export function serverUrl(): string {
  const configured = (process.env.SERVER_URL ?? '').trim().replace(TRAILING_SLASHES, '');
  if (configured !== '') {
    return configured;
  }
  return isProduction() ? appUrl() : `http://localhost:${port()}`;
}

/** The id the OIDC provider is registered under in better-auth, and so the last part of its callback path. */
export const OIDC_PROVIDER_ID = 'oidc';
/** The `OIDC_CLIENT_AUTH` values a provider can expect. */
export const OIDC_CLIENT_AUTH_METHODS = ['client_secret_basic', 'client_secret_post'] as const;

/** An OpenID Connect provider to sign in with: heautou, Keycloak, Authentik, … */
export interface OidcConfig {
  /** The issuer URL, no trailing slash. Its discovery document is `/.well-known/openid-configuration` under it. */
  issuer: string;
  clientId: string;
  /** Unset for a public client, which proves itself with PKCE alone. */
  clientSecret: string | undefined;
  /** How a confidential client sends its secret. The provider must expect the same. */
  clientAuth: AuthSettings['oidcClientAuth'];
  /** What the login page's button calls the provider. */
  name: string;
}

/**
 * Reads the OIDC provider set in the environment. Preflight refuses one of `OIDC_ISSUER` and `OIDC_CLIENT_ID`
 * without the other, and an `OIDC_CLIENT_AUTH` it does not know.
 *
 * @returns The provider when `OIDC_ISSUER` and `OIDC_CLIENT_ID` are both set, otherwise null.
 */
export function oidcConfig(): OidcConfig | null {
  const issuer = (process.env.OIDC_ISSUER ?? '').trim();
  const clientId = (process.env.OIDC_CLIENT_ID ?? '').trim();
  if (issuer === '' || clientId === '') {
    return null;
  }
  const clientAuth = (process.env.OIDC_CLIENT_AUTH ?? '').trim();
  return {
    issuer: issuer.replace(TRAILING_SLASHES, ''),
    clientId,
    clientSecret: (process.env.OIDC_CLIENT_SECRET ?? '').trim() || undefined,
    clientAuth: clientAuth === 'client_secret_post' ? clientAuth : AUTH_DEFAULTS.oidcClientAuth,
    name: (process.env.OIDC_NAME ?? '').trim() || AUTH_DEFAULTS.oidcName,
  };
}

/**
 * Names the address to register with the OIDC provider as this client's redirect URI.
 *
 * @returns better-auth's callback for the provider, under `serverUrl()`.
 */
export const oidcRedirectUri = (): string => `${serverUrl()}/api/auth/callback/${OIDC_PROVIDER_ID}`;

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

/**
 * What Express trusts `X-Forwarded-For` from, which decides whose address `req.ip` is.
 *
 * @returns `TRUST_PROXY` as Express reads it: a boolean, a hop count or a subnet list. Unset, `HTTP_DEFAULTS.trustProxy`.
 *
 * @remarks
 * The sign-in throttle counts by `req.ip`. Wrong, every client shares the proxy's address and is locked out together.
 */
export function trustProxy(): boolean | number | string {
  const value = (process.env.TRUST_PROXY ?? '').trim();
  if (value === '') {
    return HTTP_DEFAULTS.trustProxy;
  }
  if (value === TRUST_PROXY_OFF) {
    return false;
  }
  if (value === TRUST_PROXY_ON) {
    return true;
  }
  return HOP_COUNT.test(value) ? Number(value) : value;
}
