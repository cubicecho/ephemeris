import type { DB } from '@cubicecho/ephemeris-db';
import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { eq } from 'drizzle-orm';
import { extendSchema, type GraphQLSchema, parse } from 'graphql';
import jwt from 'jsonwebtoken';
import { appUrl, jwtSecret, magicLinkExposed, magicLinkRequired } from '../core/config.ts';
import type { Context } from '../core/context.ts';
import { AUTH_DEFAULTS } from '../core/defaults.ts';
import { badInput } from '../core/errors.ts';
import { objectType } from '../graphql/object-type.ts';

/** The auth mutations that are rate limited. Each has its own budget. */
export const AuthFlow = {
  RequestMagicLink: 'requestMagicLink',
  VerifyMagicLink: 'verifyMagicLink',
} as const;
export type AuthFlow = (typeof AuthFlow)[keyof typeof AuthFlow];

const MUTATION_TYPE = 'Mutation';
/** The claim a session token carries. */
const USER_ID_CLAIM = 'userId';
/** The claim a magic-link token carries. */
const EMAIL_CLAIM = 'email';

const AUTH_SDL = parse(`
  """
  The outcome of a sign-in request. When the instance runs with
  AUTH_MAGIC_LINK=false there is no link to follow, so a live session comes back
  immediately in \`token\`/\`userId\`. When magic links are on, \`magicLink\` is
  filled in only where exposing it is enabled.
  """
  type RequestMagicLinkResult {
    ok: Boolean!
    magicLink: String
    token: String
    userId: ID
  }

  type AuthPayload {
    token: String!
    userId: ID!
  }

  extend type Mutation {
    requestMagicLink(email: String!): RequestMagicLinkResult!
    verifyMagicLink(token: String!): AuthPayload!
  }
`);

/**
 * Signs a session token. Long-lived: there is no refresh flow and no session table.
 *
 * @param userId - Who the session belongs to.
 * @returns The token, valid for `AUTH_DEFAULTS.sessionTtlDays`.
 */
export function signToken(userId: string): string {
  return jwt.sign({ [USER_ID_CLAIM]: userId }, jwtSecret(), { expiresIn: `${AUTH_DEFAULTS.sessionTtlDays}d` });
}

/**
 * Signs a sign-in token. Short-lived, because it travels by mail.
 *
 * @param email - The address the link is for.
 * @returns The token, valid for `AUTH_DEFAULTS.magicLinkTtlMinutes`.
 */
export function signMagicToken(email: string): string {
  return jwt.sign({ [EMAIL_CLAIM]: email }, jwtSecret(), { expiresIn: `${AUTH_DEFAULTS.magicLinkTtlMinutes}m` });
}

/**
 * Verifies a token and reads one string claim out of it.
 *
 * @param token - The signed token.
 * @param name - The claim to read.
 * @returns The claim, or null when the token is forged, expired, or carries no such non-empty string.
 */
function readClaim(token: string, name: string): string | null {
  try {
    const payload = jwt.verify(token, jwtSecret());
    if (typeof payload === 'string') {
      return null;
    }
    const value: unknown = payload[name];
    const isUsable = typeof value === 'string' && value !== '';
    return isUsable ? value : null;
  } catch {
    return null;
  }
}

/**
 * Verifies a session token.
 *
 * @param token - The signed token.
 * @returns Who it belongs to, or null when it is not a valid session token.
 */
export function verifyToken(token: string): { userId: string } | null {
  const userId = readClaim(token, USER_ID_CLAIM);
  return userId === null ? null : { userId };
}

/**
 * Verifies a magic-link token.
 *
 * @param token - The signed token.
 * @returns The address it was issued for, or null when it is not a valid magic-link token.
 */
export function verifyMagicToken(token: string): { email: string } | null {
  const email = readClaim(token, EMAIL_CLAIM);
  return email === null ? null : { email };
}

/** What an `Authorization` header starts with when it carries a session token. */
const BEARER_PREFIX = 'Bearer ';

/**
 * Reads the signed-in user's id from a request's Bearer token.
 *
 * @param req - Anything with the request's headers.
 * @returns The user's id, or null when there is no valid session token.
 */
export function extractUserId(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header) {
    return null;
  }
  const isOtherScheme = header.startsWith(BEARER_PREFIX) === false;
  if (isOtherScheme) {
    return null;
  }
  return verifyToken(header.slice(BEARER_PREFIX.length))?.userId ?? null;
}

/**
 * Puts an address in the one form accounts are keyed by.
 *
 * @param email - The address as typed.
 * @returns It, lower-cased and trimmed.
 */
function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/**
 * Counts one attempt at an auth flow, by client address and by account.
 *
 * @param ctx - Request context.
 * @param flow - Which mutation is being attempted.
 * @param [email] - The typed email, when the flow has one.
 * @throws A TOO_MANY_REQUESTS error when the address or the account is over its budget.
 *
 * @remarks
 * Both mutations are unauthenticated. Unthrottled, anyone who can reach the port can mint sign-in tokens at will,
 * bury one inbox in links, or guess at tokens as fast as they can send them.
 */
function throttle(ctx: Context, flow: AuthFlow, email?: string): void {
  const keys = [`${flow}:ip:${ctx.ip}`];
  if (email !== undefined) {
    keys.push(`${flow}:email:${normalizeEmail(email)}`);
  }
  ctx.limiter.hit(...keys);
}

/**
 * Finds the account for an address, creating it on first sign-in.
 *
 * @param db - Database client.
 * @param email - A normalised address.
 * @returns The account's id.
 * @throws When the insert returns no row.
 *
 * @remarks
 * Registration is open. Self-hosting is the deployment model, so the person who can reach the instance is the
 * person who is meant to have an account.
 */
export async function findOrCreateUser(db: DB, email: string): Promise<string> {
  const [existing] = await db
    .select({ id: dbSchema.users.id })
    .from(dbSchema.users)
    .where(eq(dbSchema.users.email, email));
  if (existing) {
    return existing.id;
  }

  const [created] = await db.insert(dbSchema.users).values({ email }).returning({ id: dbSchema.users.id });
  if (!created) {
    throw new Error(`Creating the account for ${email} returned no row.`);
  }
  return created.id;
}

/**
 * Adds the sign-in mutations to the generated schema.
 *
 * @param schema - The schema drizzle-graphql generated.
 * @returns The schema with `requestMagicLink` and `verifyMagicLink` resolved.
 */
export function applyAuthExtension(schema: GraphQLSchema): GraphQLSchema {
  const extendedSchema = extendSchema(schema, AUTH_SDL);
  const fields = objectType(extendedSchema, MUTATION_TYPE).getFields();

  fields.requestMagicLink.resolve = async (_parent: unknown, args: { email: string }, context: Context) => {
    // First, so a refused attempt costs nothing.
    throttle(context, AuthFlow.RequestMagicLink, args.email);
    const email = normalizeEmail(args.email);

    // No-link mode: the address alone is the credential. Only for a private instance: see config.ts.
    const isDirectSignIn = magicLinkRequired() === false;
    if (isDirectSignIn) {
      const userId = await findOrCreateUser(context.db, email);
      console.log(`[auth] Magic links are off; signed ${email} in directly.`);
      return { ok: true, magicLink: null, token: signToken(userId), userId };
    }

    const magicLink = `${appUrl()}/auth/verify?token=${signMagicToken(email)}`;
    // Ephemeris ships no mail provider, so the console is the delivery channel.
    console.log(`\n[auth] Magic link for ${email}:\n${magicLink}\n`);
    return { ok: true, magicLink: magicLinkExposed() ? magicLink : null, token: null, userId: null };
  };

  fields.verifyMagicLink.resolve = async (_parent: unknown, args: { token: string }, context: Context) => {
    throttle(context, AuthFlow.VerifyMagicLink);
    const payload = verifyMagicToken(args.token);
    if (!payload) {
      throw badInput('Invalid or expired magic link');
    }
    const userId = await findOrCreateUser(context.db, normalizeEmail(payload.email));
    return { token: signToken(userId), userId };
  };

  return extendedSchema;
}
