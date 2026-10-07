import { beforeAll, describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../auth/rate-limit.ts';
import { ErrorCode } from '../../core/errors.ts';
import { createClient, createTestDb, type TestDb } from '../helpers.ts';

/** Small enough to reach in two calls. */
const BUDGET = { maxAttempts: 2 };
const OTHER_IP = '203.0.113.7';

const REQUEST_MAGIC_LINK = /* GraphQL */ `
  mutation RequestMagicLink($email: String!) {
    requestMagicLink(email: $email) {
      ok
    }
  }
`;

const VERIFY_MAGIC_LINK = /* GraphQL */ `
  mutation VerifyMagicLink($token: String!) {
    verifyMagicLink(token: $token) {
      userId
    }
  }
`;

describe('the sign-in throttle', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
  });

  it('refuses one address asking for links to many accounts', async () => {
    const client = createClient(db, null, { limiter: createRateLimiter(BUDGET) });
    await client.expectOk(REQUEST_MAGIC_LINK, { email: 'first@example.com' });
    await client.expectOk(REQUEST_MAGIC_LINK, { email: 'second@example.com' });

    const error = await client.expectError(REQUEST_MAGIC_LINK, { email: 'third@example.com' });
    expect(error.code).toBe(ErrorCode.TooManyRequests);
  });

  it('refuses many addresses asking for links to one account, however it is typed', async () => {
    const limiter = createRateLimiter(BUDGET);
    const here = createClient(db, null, { limiter });
    const elsewhere = createClient(db, null, { limiter, ip: OTHER_IP });
    await here.expectOk(REQUEST_MAGIC_LINK, { email: 'flooded@example.com' });
    await here.expectOk(REQUEST_MAGIC_LINK, { email: ' Flooded@Example.com ' });

    const error = await elsewhere.expectError(REQUEST_MAGIC_LINK, { email: 'FLOODED@example.com' });
    expect(error.code).toBe(ErrorCode.TooManyRequests);
  });

  it('refuses an address guessing at tokens before it reads the next one', async () => {
    const client = createClient(db, null, { limiter: createRateLimiter(BUDGET) });
    const first = await client.expectError(VERIFY_MAGIC_LINK, { token: 'guess-1' });
    expect(first.code).toBe(ErrorCode.BadUserInput);
    await client.expectError(VERIFY_MAGIC_LINK, { token: 'guess-2' });

    const refused = await client.expectError(VERIFY_MAGIC_LINK, { token: 'guess-3' });
    expect(refused.code).toBe(ErrorCode.TooManyRequests);
  });

  it('keeps a budget per flow, so asking for links does not use up verifying them', async () => {
    const client = createClient(db, null, { limiter: createRateLimiter(BUDGET) });
    await client.expectOk(REQUEST_MAGIC_LINK, { email: 'flows@example.com' });
    await client.expectOk(REQUEST_MAGIC_LINK, { email: 'flows@example.com' });

    const error = await client.expectError(VERIFY_MAGIC_LINK, { token: 'not-a-token' });
    expect(error.code).toBe(ErrorCode.BadUserInput);
  });
});
