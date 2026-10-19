import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Auth, sessionUserId } from '../../auth/better-auth.ts';
import { createSessionToken, createTestAuth, createTestDb, createUser, type TestDb } from '../helpers.ts';

// Every other server test hands the client its `userId` directly, so this is
// the one place a request's header is turned into a caller. It is also all that
// stands between a request and someone else's journal.

let db: TestDb;
let auth: Auth;
let userId: string;
let token: string;

/**
 * Builds a request's headers as `sessionUserId` reads them.
 *
 * @param [authorization] - The one header, or none.
 * @returns The headers.
 */
const headers = (authorization?: string): Headers => new Headers(authorization === undefined ? {} : { authorization });

beforeAll(async () => {
  db = await createTestDb();
  auth = createTestAuth(db).auth;
  userId = await createUser(db, 'session@example.com');
  token = await createSessionToken(auth, userId);
});

describe('sessionUserId', () => {
  it('reads the user out of a live session', async () => {
    expect(await sessionUserId(auth, headers(`Bearer ${token}`))).toBe(userId);
  });

  it('answers null for no header at all', async () => {
    expect(await sessionUserId(auth, headers())).toBeNull();
  });

  it('requires the Bearer scheme', async () => {
    expect(await sessionUserId(auth, headers(token))).toBeNull();
    expect(await sessionUserId(auth, headers(`Basic ${token}`))).toBeNull();
  });

  it('answers null rather than throwing on a token that is not one, a signed JWT from before among them', async () => {
    expect(await sessionUserId(auth, headers('Bearer '))).toBeNull();
    expect(await sessionUserId(auth, headers('Bearer not-a-token'))).toBeNull();
    expect(await sessionUserId(auth, headers('Bearer a.b.c'))).toBeNull();
  });

  it('refuses a session that has run out', async () => {
    const expiring = await createSessionToken(auth, userId);
    await db
      .update(dbSchema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1) })
      .where(eq(dbSchema.sessions.token, expiring));
    expect(await sessionUserId(auth, headers(`Bearer ${expiring}`))).toBeNull();
  });

  it('refuses a session whose row is gone', async () => {
    const revoked = await createSessionToken(auth, userId);
    await db.delete(dbSchema.sessions).where(eq(dbSchema.sessions.token, revoked));
    expect(await sessionUserId(auth, headers(`Bearer ${revoked}`))).toBeNull();
  });
});
