import type { DB } from '@cubicecho/ephemeris-db';
import {
  applyBetterAuthGraphQL,
  betterAuthGraphQL,
  type JsonSchema,
  type OperationOptions,
} from '@cubicecho/graphql-better-auth';
import { GraphQLError, type GraphQLSchema } from 'graphql';
import { z } from 'zod';
import { magicLinkExposed, magicLinkRequired } from '../core/config.ts';
import type { Context } from '../core/context.ts';
import { badInput } from '../core/errors.ts';
import { parseOrThrow } from '../core/validation.ts';
import { createAuth, sessionUserId, withSentLinks } from './better-auth.ts';
import { AuthFlow, throttle } from './throttle.ts';

// better-auth's own endpoints, served as GraphQL by @cubicecho/graphql-better-auth: signing in, the caller's session,
// and signing out. Fields, arguments and types are read off the auth config, so a better-auth upgrade moves them
// with it. What Ephemeris adds is in the `operations` below: the throttle, SECURE_LOCAL_NET, the exposed link, and
// errors that never sign anyone out.

/** The better-auth endpoints served, by name. A plugin's new endpoint is served only once it is named here. */
export const BETTER_AUTH_OPERATIONS = [
  'signInMagicLink',
  'magicLinkVerify',
  'verifyOneTimeToken',
  'getSession',
  'signOut',
];

/** How an account made by a sign-in with no link is labelled in better-auth's hooks. */
const LOCAL_NET_METHOD = 'secure-local-net';

/** What a link that cannot be spent is told, whichever way it is wrong. */
const BAD_LINK = 'Invalid or expired sign-in link.';

/** What a one-time token that cannot be spent is told: the sign-in has to be started again. */
const BAD_SSO_TOKEN = 'Invalid or expired sign-in. Sign in again.';

const emailInput = z.email('Enter a valid email address.');

const NULLABLE_STRING: JsonSchema = { type: ['string', 'null'] };

/** A session as the client keeps it: the bearer token, and whose it is. */
const SESSION_RESULT: JsonSchema = {
  type: 'object',
  properties: {
    token: { type: 'string', description: 'The session, to send as `Authorization: Bearer <token>`.' },
    userId: { type: 'string', format: 'uuid', description: "The session's user." },
  },
  required: ['token', 'userId'],
};

/**
 * What a new account is called until its owner says otherwise.
 *
 * @param email - The account's address, already normalized.
 * @returns The part of the address before the `@`.
 */
function nameFor(email: string): string {
  return email.split('@')[0] ?? email;
}

/**
 * Signs an address in on the strength of the network alone, creating the account when there is none.
 *
 * @param context - The request context.
 * @param email - The address, already normalized.
 * @returns The session's bearer token and user.
 *
 * @remarks
 * Registration is open either way: self-hosting is the deployment model, so whoever can reach the instance is who is
 * meant to have an account. `emailVerified` stays false, so a later link or provider sign-in verifies the same row.
 * This leans on `$context.internalAdapter`, an internal better-auth API; endpoints.test.ts is what says when an
 * upgrade breaks it.
 */
async function signInOnLocalNet(context: Context, email: string): Promise<{ token: string; userId: string }> {
  const { internalAdapter } = await context.auth.$context;
  const existing = await internalAdapter.findUserByEmail(email);
  const user =
    existing?.user ??
    (await internalAdapter.createUser(
      { email, name: nameFor(email), emailVerified: false },
      { method: LOCAL_NET_METHOD },
    ));
  const session = await internalAdapter.createSession(user.id);
  return { token: session.token, userId: user.id };
}

/**
 * Runs a token-spending call, and answers any refusal from better-auth with one message.
 *
 * @param next - The call.
 * @param message - What the caller is told when the token is refused.
 * @returns What the call returned.
 *
 * @remarks
 * BAD_USER_INPUT, never the UNAUTHENTICATED better-auth's 401 maps to: that one is what the client drops its session
 * on, and a bad link must not sign anyone out. What is not a refusal (the database failing) is rethrown as it is.
 */
async function refusedAs(next: () => Promise<unknown>, message: string): Promise<unknown> {
  try {
    return await next();
  } catch (error) {
    throw error instanceof GraphQLError ? badInput(message) : error;
  }
}

/**
 * Sign-in. Takes only an address: the link always goes to the app's verify screen, and a new account is named after
 * the address. Under SECURE_LOCAL_NET (or AUTH_MAGIC_LINK=false) no link is sent and the session comes back in
 * `token` and `userId`. Under EXPOSE_MAGIC_LINK the link comes back in `magicLink`.
 */
const signInMagicLink: OperationOptions<Context> = {
  omitArgs: ['name', 'metadata', 'callbackURL', 'newUserCallbackURL', 'errorCallbackURL'],
  result: (documented) => ({
    ...documented,
    type: 'object',
    properties: {
      ...documented?.properties,
      token: { ...NULLABLE_STRING, description: 'A live session, when an address alone signs in (SECURE_LOCAL_NET).' },
      userId: { type: ['string', 'null'], format: 'uuid', description: "The session's user, when `token` is set." },
      magicLink: {
        ...NULLABLE_STRING,
        description: 'The link itself, on an instance that exposes it (EXPOSE_MAGIC_LINK).',
      },
    },
  }),
  around: async (call, next) => {
    const normalized = String(call.body.email).toLowerCase().trim();
    // First, so a refused attempt costs nothing.
    throttle(call.context, AuthFlow.SignInMagicLink, normalized);
    const email = parseOrThrow(emailInput, normalized);

    // The network is the credential, so the address alone opens the account.
    if (magicLinkRequired() === false) {
      return { status: true, magicLink: null, ...(await signInOnLocalNet(call.context, email)) };
    }
    call.body.email = email;
    call.body.name = nameFor(email);
    const { result, links } = await withSentLinks(next);
    const exposed = magicLinkExposed() ? (links.at(-1)?.url ?? null) : null;
    return { ...(result as object), token: null, userId: null, magicLink: exposed };
  },
};

/** Spends a sign-in link's token for a session. Expired, used and unknown tokens answer the same. */
const magicLinkVerify: OperationOptions<Context> = {
  around: (call, next) => {
    // By address alone: until the token verifies there is no account to count against.
    throttle(call.context, AuthFlow.MagicLinkVerify);
    return refusedAs(next, BAD_LINK);
  },
};

/**
 * The last leg of an OIDC sign-in: the app's /auth/sso screen spends the one-time token http/sso.ts put on its URL.
 * Answers with the session's bearer token and user rather than better-auth's whole session row.
 */
const verifyOneTimeToken: OperationOptions<Context> = {
  result: () => SESSION_RESULT,
  around: async (call, next) => {
    throttle(call.context, AuthFlow.VerifyOneTimeToken);
    const result = (await refusedAs(next, BAD_SSO_TOKEN)) as { session: { token: string }; user: { id: string } };
    return { token: result.session.token, userId: result.user.id };
  },
};

/** Ends the caller's session. Signing out with none is `success: false`, not an error. */
const signOut: OperationOptions<Context> = {
  // For a provider's logout page, which Ephemeris does not send anyone to.
  omitArgs: ['callbackURL', 'disableRedirect', 'state'],
  around: async (call, next) => {
    if ((await sessionUserId(call.context.auth, call.context.headers)) === null) {
      return { success: false };
    }
    return next();
  },
};

/**
 * Adds better-auth's endpoints to the schema. Each call goes to the request's own auth instance with the request's
 * headers, which is where better-auth finds the session.
 *
 * @param schema - The schema so far.
 * @param db - The database the auth instance that describes the fields is built over.
 * @returns The schema with them.
 */
export function applyBetterAuthExtension(schema: GraphQLSchema, db: DB): GraphQLSchema {
  // Described from an instance with no OIDC provider, whose discovery document describing would fetch, so the SDL
  // and the app's generated types do not change with the environment. A request's own instance is what is called.
  const describing = createAuth(db, { oidc: null, sendMagicLink: async () => {} });
  const built = betterAuthGraphQL<Context>(describing, {
    include: BETTER_AUTH_OPERATIONS,
    auth: (context) => context.auth,
    headers: (context) => context.headers,
    operations: { signInMagicLink, magicLinkVerify, verifyOneTimeToken, signOut },
  });
  return applyBetterAuthGraphQL(schema, built);
}
