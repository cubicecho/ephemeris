// Everything is read at call time so a test — or a reload — sees the current
// environment.

/** Truthy env-var values: "1", "true", "yes" (case-insensitive). */
export function envFlag(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value ?? '').trim().toLowerCase());
}

/** Falsy env-var values: "0", "false", "no" (case-insensitive). */
function envDisabled(value: string | undefined): boolean {
  return ['0', 'false', 'no'].includes((value ?? '').trim().toLowerCase());
}

function envNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Whether this instance trusts the network it is on.
 *
 * `SECURE_LOCAL_NET` is the ecosystem-wide spelling of "there is nothing hostile
 * between the browser and this port, so do not make people prove who they are".
 * Here that means sign-in needs no link.
 */
export function secureLocalNet(): boolean {
  return envFlag(process.env.SECURE_LOCAL_NET);
}

/**
 * Whether signing in requires following a magic link at all.
 *
 * Off — by `SECURE_LOCAL_NET=true` or the narrower `AUTH_MAGIC_LINK=false` —
 * `requestMagicLink` hands back a live session for whatever address it is given.
 * That is a deliberate convenience for a private self-hosted instance, and must
 * never be set on one exposed to the internet: the email address becomes the
 * entire credential.
 */
export function magicLinkRequired(): boolean {
  return !secureLocalNet() && !envDisabled(process.env.AUTH_MAGIC_LINK);
}

/** Whether the magic link is returned in the API response rather than only logged. */
export function magicLinkExposed(): boolean {
  return process.env.NODE_ENV !== 'production' || envFlag(process.env.EXPOSE_MAGIC_LINK);
}

export function port(): number {
  return envNumber(process.env.PORT, 3005);
}

/**
 * Where this instance is reached. In production the server serves the client
 * itself, so its own origin is the right default — but only for someone
 * browsing from this machine. Set APP_URL to the address users actually type;
 * magic links are built from it, and a link to `localhost` is useless in an
 * inbox.
 */
export function appUrl(): string {
  return process.env.APP_URL ?? `http://localhost:${port()}`;
}

/**
 * Largest entry body accepted, in characters.
 *
 * A journal has no natural ceiling, so this is a cap on a text column that
 * anyone who can sign in may write to, not an editorial opinion. Default 64k —
 * roughly 10,000 words, which no one writes in a day.
 */
export function maxBodyChars(): number {
  return envNumber(process.env.MAX_BODY_CHARS, 64 * 1024);
}
