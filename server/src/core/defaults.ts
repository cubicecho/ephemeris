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
}

export const HTTP_DEFAULTS: Readonly<HttpSettings> = Object.freeze({
  port: 3005,
  bodyLimit: '1mb',
  drainSeconds: 5,
  shutdownDeadlineSeconds: 8,
});

/** The sign-in throttle. */
export interface RateLimitSettings {
  /** Attempts allowed per key inside one window. */
  maxAttempts: number;
  /** How long an attempt counts against its key. */
  windowMinutes: number;
}

export const RATE_LIMIT_DEFAULTS: Readonly<RateLimitSettings> = Object.freeze({
  maxAttempts: 5,
  windowMinutes: 15,
});

/** Sign-in and credential settings. */
export interface AuthSettings {
  /** How long an emailed sign-in link works. Short, because it travels by mail. */
  magicLinkTtlMinutes: number;
  /** How long a session token works. Long, because there is no refresh flow and no session table. */
  sessionTtlDays: number;
  /** Shortest signing secret production accepts, in characters. `openssl rand -hex 32` gives 64. */
  minSecretLength: number;
  /** Whether typing an email signs in, with no link. Unsafe on a public network. `SECURE_LOCAL_NET` overrides it. */
  secureLocalNet: boolean;
  /** Whether sign-in needs a magic link followed. `AUTH_MAGIC_LINK` overrides it, and `SECURE_LOCAL_NET` turns it off. */
  magicLinkRequired: boolean;
}

export const AUTH_DEFAULTS: Readonly<AuthSettings> = Object.freeze({
  magicLinkTtlMinutes: 15,
  sessionTtlDays: 30,
  minSecretLength: 32,
  secureLocalNet: false,
  magicLinkRequired: true,
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
