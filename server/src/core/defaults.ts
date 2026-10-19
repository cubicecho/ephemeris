// Every value someone might tune, as plain data. Nothing here computes, reads the environment or imports.

/** Settings for the HTTP doors and the process behind them. */
export interface HttpSettings {
  /** The port to listen on. `PORT` overrides it. */
  port: number;
  /** Largest JSON body /graphql accepts, as `express.json` reads it. A full-length entry is well under it. */
  bodyLimit: string;
  /** How long shutdown lets open requests finish before it cuts them. */
  drainSeconds: number;
  /** How long shutdown may take in all before a hard exit. Keep it under Docker's 10 s. */
  shutdownDeadlineSeconds: number;
  /** Express's `trust proxy`: false with nothing in front, a hop count or a subnet list behind a proxy. */
  trustProxy: boolean | number | string;
}

export const HTTP_DEFAULTS: Readonly<HttpSettings> = Object.freeze({
  port: 3005,
  bodyLimit: '1mb',
  drainSeconds: 5,
  shutdownDeadlineSeconds: 8,
  trustProxy: false,
});

/** The sign-in throttle. */
export interface RateLimitSettings {
  /** Attempts allowed per key inside one window. */
  maxAttempts: number;
  /** How long an attempt counts against its key. */
  windowMinutes: number;
  /** How many keys the limiter holds before it drops the stale ones. */
  sweepAtKeys: number;
}

export const RATE_LIMIT_DEFAULTS: Readonly<RateLimitSettings> = Object.freeze({
  maxAttempts: 5,
  windowMinutes: 15,
  sweepAtKeys: 10_000,
});

/** Sign-in and credential settings. */
export interface AuthSettings {
  /** How long a sign-in link works. Short, because it travels by mail or a log. */
  magicLinkTtlMinutes: number;
  /** How long a session lasts after it was last used. Long: there is no password to fall back on. */
  sessionTtlDays: number;
  /** Shortest signing secret production accepts, in characters. `openssl rand -hex 32` gives 64. */
  minSecretLength: number;
  /** Whether typing an email signs in, with no link. Unsafe on a public network. `SECURE_LOCAL_NET` overrides it. */
  secureLocalNet: boolean;
  /** Whether sign-in needs a magic link followed. `AUTH_MAGIC_LINK` overrides it, and `SECURE_LOCAL_NET` turns it off. */
  magicLinkRequired: boolean;
  /** How long the token an OIDC callback hands the app works: the hop from the callback to `/auth/sso`. */
  oneTimeTokenTtlMinutes: number;
  /** What the login page's OIDC button calls the provider. `OIDC_NAME` overrides it. */
  oidcName: string;
  /** How a confidential OIDC client sends its secret. `OIDC_CLIENT_AUTH` overrides it. */
  oidcClientAuth: 'client_secret_basic' | 'client_secret_post';
  /** How long pairing waits on the provider before calling it unreachable. */
  oidcPairingTimeoutMs: number;
}

export const AUTH_DEFAULTS: Readonly<AuthSettings> = Object.freeze({
  magicLinkTtlMinutes: 15,
  sessionTtlDays: 30,
  minSecretLength: 32,
  secureLocalNet: false,
  magicLinkRequired: true,
  oneTimeTokenTtlMinutes: 3,
  oidcName: 'SSO',
  // The default the OIDC spec names.
  oidcClientAuth: 'client_secret_basic',
  oidcPairingTimeoutMs: 10_000,
});

/** Limits on what an entry may hold. */
export interface EntrySettings {
  /** Longest body, in characters: about 10,000 words, which no one writes in a day. `MAX_BODY_CHARS` overrides it. */
  maxBodyLength: number;
}

export const ENTRY_DEFAULTS: Readonly<EntrySettings> = Object.freeze({
  maxBodyLength: 65_536,
});

/** The bounds on one GraphQL operation: how many rows a list returns, and how deep and costly a document may be. */
export interface OperationLimitSettings {
  /** Rows a list returns when the request passes no `limit`. */
  defaultPageSize: number;
  /** The largest `limit` a request may pass. Above it: DRIZZLE_LIMIT_EXCEEDED. */
  maxPageSize: number;
  /** How deeply selections may nest. */
  maxDepth: number;
  /** How many aliases one document may use. Each is another copy of a field's cost. */
  maxAliases: number;
  /** The most one operation may cost. A list costs its page size times the cost of one row. */
  maxCost: number;
  /** What a field with no cost hint costs. */
  defaultFieldCost: number;
}

export const OPERATION_LIMIT_DEFAULTS: Readonly<OperationLimitSettings> = Object.freeze({
  defaultPageSize: 50,
  maxPageSize: 500,
  maxDepth: 8,
  maxAliases: 15,
  maxCost: 10_000,
  defaultFieldCost: 1,
});
