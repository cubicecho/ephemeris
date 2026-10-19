import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { eq } from 'drizzle-orm';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Auth, type MagicLink, sessionUserId } from '../../auth/better-auth.ts';
import { createRateLimiter } from '../../auth/rate-limit.ts';
import { ErrorCode } from '../../core/errors.ts';
import {
  bearer,
  createClient,
  createTestAuth,
  createTestDb,
  createUser,
  resetTestDb,
  type TestClient,
  type TestDb,
} from '../helpers.ts';

// Sign-in is better-auth's own endpoints, served as GraphQL. These cover what
// Ephemeris adds around them: SECURE_LOCAL_NET and AUTH_MAGIC_LINK=false signing
// in by address alone, EXPOSE_MAGIC_LINK handing the link back, the throttle, and
// a bad link answering BAD_USER_INPUT so that it never signs anyone out.

const CONFIG = `query { authConfig { secureLocalNet sso { name } } }`;
const SIGN_IN = `mutation ($email: String!) { signInMagicLink(email: $email) { status token userId magicLink } }`;
const VERIFY = `mutation ($token: String!) { magicLinkVerify(token: $token) { token user { id } } }`;
const SESSION = `query { getSession { user { id email } } }`;
const SIGN_OUT = `mutation { signOut { success } }`;

/** Small enough to reach in two calls. */
const BUDGET = { maxAttempts: 2 };
const OTHER_IP = '203.0.113.7';

let db: TestDb;
let auth: Auth;
let links: MagicLink[];
let anonymous: TestClient;

/**
 * Asks for a link and returns the token it was sent with.
 *
 * @param email - The address to sign in.
 * @returns The link's token.
 */
async function linkTokenFor(email: string): Promise<string> {
  await anonymous.expectOk(SIGN_IN, { email });
  const link = links.at(-1);
  if (link === undefined) {
    throw new Error('No sign-in link was delivered.');
  }
  return link.token;
}

/**
 * Signs an address in through a link.
 *
 * @param email - The address.
 * @returns A client carrying the session, and the session.
 */
async function signedIn(email: string): Promise<{ client: TestClient; token: string; userId: string }> {
  const { magicLinkVerify } = await anonymous.expectOk(VERIFY, { token: await linkTokenFor(email) });
  const { token, user } = magicLinkVerify;
  return { client: createClient(db, user.id, { auth, headers: bearer(token) }), token, userId: user.id };
}

beforeAll(async () => {
  db = await createTestDb();
});

beforeEach(async () => {
  await resetTestDb(db);
  ({ auth, links } = createTestAuth(db));
  anonymous = createClient(db, null, { auth });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('authConfig', () => {
  it('asks for a link by default, and offers no provider without one', async () => {
    const data = await anonymous.expectOk(CONFIG);
    expect(data.authConfig).toEqual({ secureLocalNet: false, sso: null });
  });

  it.each([
    ['SECURE_LOCAL_NET', 'SECURE_LOCAL_NET', 'true'],
    ['AUTH_MAGIC_LINK=false', 'AUTH_MAGIC_LINK', 'false'],
  ])('says an address alone signs in under %s', async (_name, variable, value) => {
    vi.stubEnv(variable, value);
    const data = await anonymous.expectOk(CONFIG);
    expect(data.authConfig.secureLocalNet).toBe(true);
  });
});

describe('signInMagicLink', () => {
  it('delivers a link to the app and returns no session', async () => {
    const data = await anonymous.expectOk(SIGN_IN, { email: 'new@example.com' });
    expect(data.signInMagicLink).toMatchObject({ status: true, token: null, userId: null });
    expect(links).toHaveLength(1);
    expect(links[0]?.email).toBe('new@example.com');
    expect(links[0]?.url).toContain(`/auth/verify?token=${links[0]?.token}`);
  });

  it('hands the link back outside production, where it is exposed by default', async () => {
    const data = await anonymous.expectOk(SIGN_IN, { email: 'exposed@example.com' });
    expect(data.signInMagicLink.magicLink).toBe(links[0]?.url);
  });

  it('keeps the link out of the response in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const data = await anonymous.expectOk(SIGN_IN, { email: 'hidden@example.com' });
    expect(data.signInMagicLink.magicLink).toBeNull();
    expect(JSON.stringify(data)).not.toContain(links[0]?.token);
  });

  it('hands the link back in production under EXPOSE_MAGIC_LINK', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('EXPOSE_MAGIC_LINK', 'true');
    const data = await anonymous.expectOk(SIGN_IN, { email: 'single-user@example.com' });
    expect(data.signInMagicLink.magicLink).toBe(links[0]?.url);
  });

  it('refuses an address that is not one', async () => {
    const error = await anonymous.expectError(SIGN_IN, { email: 'not-an-address' });
    expect(error.code).toBe(ErrorCode.BadUserInput);
  });

  it.each([
    ['SECURE_LOCAL_NET', 'SECURE_LOCAL_NET', 'true'],
    ['AUTH_MAGIC_LINK=false', 'AUTH_MAGIC_LINK', 'false'],
  ])('signs straight in under %s, with no link sent', async (_name, variable, value) => {
    vi.stubEnv(variable, value);
    const data = await anonymous.expectOk(SIGN_IN, { email: 'local@example.com' });
    const { token, userId } = data.signInMagicLink;
    expect(links).toHaveLength(0);
    expect(await sessionUserId(auth, bearer(token))).toBe(userId);
  });

  it('opens the account that already has the address, however it is typed', async () => {
    vi.stubEnv('SECURE_LOCAL_NET', 'true');
    const existing = await createUser(db, 'kept@example.com');
    const data = await anonymous.expectOk(SIGN_IN, { email: ' Kept@Example.com ' });
    expect(data.signInMagicLink.userId).toBe(existing);
    expect(await db.select().from(dbSchema.users)).toHaveLength(1);
  });

  it('makes the first account the admin and no other', async () => {
    vi.stubEnv('SECURE_LOCAL_NET', 'true');
    await anonymous.expectOk(SIGN_IN, { email: 'first@example.com' });
    await anonymous.expectOk(SIGN_IN, { email: 'second@example.com' });
    const admins = await db.select().from(dbSchema.users).where(eq(dbSchema.users.isAdmin, true));
    expect(admins.map((user: { email: string }) => user.email)).toEqual(['first@example.com']);
  });
});

describe('magicLinkVerify', () => {
  it('trades the link for a session the server recognises', async () => {
    const data = await anonymous.expectOk(VERIFY, { token: await linkTokenFor('verify@example.com') });
    const { token, user } = data.magicLinkVerify;
    expect(await sessionUserId(auth, bearer(token))).toBe(user.id);
  });

  it('opens an account made before better-auth, rather than a second one', async () => {
    const existing = await createUser(db, 'early@example.com');
    const data = await anonymous.expectOk(VERIFY, { token: await linkTokenFor('Early@Example.com') });
    expect(data.magicLinkVerify.user.id).toBe(existing);
  });

  it('spends a link: the second use is refused', async () => {
    const token = await linkTokenFor('once@example.com');
    await anonymous.expectOk(VERIFY, { token });
    const error = await anonymous.expectError(VERIFY, { token });
    expect(error.code).toBe(ErrorCode.BadUserInput);
  });

  it('rejects a garbage token as bad input, not as an expired session', async () => {
    // UNAUTHENTICATED is what the client drops its token on; a bad link is a bad argument and must not sign anyone out.
    const error = await anonymous.expectError(VERIFY, { token: 'not-a-token' });
    expect(error.code).toBe(ErrorCode.BadUserInput);
  });

  it('rejects a link that has run out', async () => {
    const token = await linkTokenFor('late@example.com');
    await db.update(dbSchema.verifications).set({ expiresAt: new Date(Date.now() - 1) });
    const error = await anonymous.expectError(VERIFY, { token });
    expect(error.code).toBe(ErrorCode.BadUserInput);
  });
});

describe('sessions', () => {
  it("reads the caller's own session", async () => {
    const { client, userId } = await signedIn('session@example.com');
    const data = await client.expectOk(SESSION);
    expect(data.getSession).toEqual({ user: { id: userId, email: 'session@example.com' } });
  });

  it('answers null for a request with no session', async () => {
    const data = await anonymous.expectOk(SESSION);
    expect(data.getSession).toBeNull();
  });

  it('ends the session the request carries on sign-out', async () => {
    const { client, token } = await signedIn('leaving@example.com');
    const data = await client.expectOk(SIGN_OUT);
    expect(data.signOut).toEqual({ success: true });
    expect(await sessionUserId(auth, bearer(token))).toBeNull();
  });

  it('answers false to signing out with no session', async () => {
    const data = await anonymous.expectOk(SIGN_OUT);
    expect(data.signOut).toEqual({ success: false });
  });
});

describe('the sign-in throttle', () => {
  it('refuses one address asking for links to many accounts', async () => {
    const client = createClient(db, null, { auth, limiter: createRateLimiter(BUDGET) });
    await client.expectOk(SIGN_IN, { email: 'first@example.com' });
    await client.expectOk(SIGN_IN, { email: 'second@example.com' });

    const error = await client.expectError(SIGN_IN, { email: 'third@example.com' });
    expect(error.code).toBe(ErrorCode.TooManyRequests);
    expect(links).toHaveLength(2);
  });

  it('refuses many addresses asking for links to one account, however it is typed', async () => {
    const limiter = createRateLimiter(BUDGET);
    const here = createClient(db, null, { auth, limiter });
    const elsewhere = createClient(db, null, { auth, limiter, ip: OTHER_IP });
    await here.expectOk(SIGN_IN, { email: 'flooded@example.com' });
    await here.expectOk(SIGN_IN, { email: ' Flooded@Example.com ' });

    const error = await elsewhere.expectError(SIGN_IN, { email: 'FLOODED@example.com' });
    expect(error.code).toBe(ErrorCode.TooManyRequests);
  });

  it('refuses an address guessing at tokens before it reads the next one', async () => {
    const client = createClient(db, null, { auth, limiter: createRateLimiter(BUDGET) });
    const first = await client.expectError(VERIFY, { token: 'guess-1' });
    expect(first.code).toBe(ErrorCode.BadUserInput);
    await client.expectError(VERIFY, { token: 'guess-2' });

    const refused = await client.expectError(VERIFY, { token: 'guess-3' });
    expect(refused.code).toBe(ErrorCode.TooManyRequests);
  });

  it('keeps a budget per flow, so asking for links does not use up verifying them', async () => {
    const client = createClient(db, null, { auth, limiter: createRateLimiter(BUDGET) });
    await client.expectOk(SIGN_IN, { email: 'flows@example.com' });
    await client.expectOk(SIGN_IN, { email: 'flows@example.com' });

    const error = await client.expectError(VERIFY, { token: 'not-a-token' });
    expect(error.code).toBe(ErrorCode.BadUserInput);
  });

  it('throttles signing in by address alone too', async () => {
    vi.stubEnv('SECURE_LOCAL_NET', 'true');
    const client = createClient(db, null, { auth, limiter: createRateLimiter(BUDGET) });
    await client.expectOk(SIGN_IN, { email: 'local-1@example.com' });
    await client.expectOk(SIGN_IN, { email: 'local-2@example.com' });
    const error = await client.expectError(SIGN_IN, { email: 'local-3@example.com' });
    expect(error.code).toBe(ErrorCode.TooManyRequests);
  });
});

describe('authentication', () => {
  it('refuses to read anything without a session', async () => {
    const error = await anonymous.expectError(`query { entries { id } }`);
    expect(error.code).toBe(ErrorCode.Unauthenticated);
  });

  it('keeps the auth and pairing tables out of the API', async () => {
    const mine = createClient(db, await createUser(db, 'curious@example.com'));
    for (const field of ['sessions', 'accounts', 'verifications', 'oidcSettings']) {
      const result = await mine.run(`query { ${field} { id } }`);
      expect(result.errors?.[0]?.message).toContain('Cannot query field');
    }
  });
});
