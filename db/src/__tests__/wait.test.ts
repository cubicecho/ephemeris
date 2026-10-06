import { describe, expect, it } from 'vitest';
import { type Queryable, waitForDatabase } from '../wait.ts';

/** Short enough that a test of the retry loop takes milliseconds. */
const FAST = { firstRetryDelayMs: 1, maxRetryDelayMs: 2, connectTimeoutMs: 1_000 };
const NO_LOG = (): void => {};

/**
 * Builds an error carrying a driver or Postgres code.
 *
 * @param code - The code to carry.
 * @returns The error.
 */
function coded(code: string): Error {
  return Object.assign(new Error(code), { code });
}

/**
 * Builds a database that fails a set number of times before it answers.
 *
 * @param failures - The errors to throw, one per attempt, in order.
 * @returns The database, and how many times it was asked.
 */
function flakyDatabase(failures: Error[]): { db: Queryable; attempts: () => number } {
  let attempts = 0;
  const db: Queryable = {
    execute: async () => {
      const failure = failures[attempts];
      attempts += 1;
      if (failure !== undefined) {
        throw failure;
      }
    },
  };
  return { db, attempts: () => attempts };
}

describe('waitForDatabase', () => {
  it('retries while Postgres is still starting', async () => {
    const { db, attempts } = flakyDatabase([coded('ECONNREFUSED'), coded('57P03')]);

    await waitForDatabase(db, FAST, NO_LOG);

    expect(attempts()).toBe(3);
  });

  it('reads the socket error off the cause, where postgres-js puts it', async () => {
    const wrapped = new Error('connect failed', { cause: coded('ECONNREFUSED') });
    const { db, attempts } = flakyDatabase([wrapped]);

    await waitForDatabase(db, FAST, NO_LOG);

    expect(attempts()).toBe(2);
  });

  it('fails at once on an error that waiting will not fix', async () => {
    const wrongPassword = coded('28P01');
    const { db, attempts } = flakyDatabase([wrongPassword]);

    await expect(waitForDatabase(db, FAST, NO_LOG)).rejects.toBe(wrongPassword);
    expect(attempts()).toBe(1);
  });

  it('gives up with the last error once the budget runs out', async () => {
    const refused = coded('ECONNREFUSED');
    const { db } = flakyDatabase([refused, refused, refused]);

    await expect(waitForDatabase(db, { ...FAST, connectTimeoutMs: 0 }, NO_LOG)).rejects.toBe(refused);
  });
});
