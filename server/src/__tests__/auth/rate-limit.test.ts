import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../../auth/rate-limit.ts';
import { ErrorCode } from '../../core/errors.ts';
import { MS_PER_SECOND, SECONDS_PER_MINUTE } from '../../core/wire.ts';

const SETTINGS = { maxAttempts: 2, windowMinutes: 1, sweepAtKeys: 2 };
const WINDOW_MS = SETTINGS.windowMinutes * SECONDS_PER_MINUTE * MS_PER_SECOND;
const START = 1_000_000;

/**
 * Builds a limiter on a clock the test moves.
 *
 * @returns The limiter and a function that advances its clock.
 */
function createClockedLimiter() {
  const clock = { at: START };
  const limiter = createRateLimiter(SETTINGS, () => clock.at);
  const advance = (ms: number): void => {
    clock.at += ms;
  };
  return { limiter, advance };
}

/**
 * Reads the refusal a call throws.
 *
 * @param attempt - The call expected to throw.
 * @returns The thrown error's extensions.
 */
function refusalOf(attempt: () => void): Record<string, unknown> {
  try {
    attempt();
  } catch (error) {
    return (error as { extensions: Record<string, unknown> }).extensions;
  }
  throw new Error('expected a refusal, got none');
}

describe('createRateLimiter', () => {
  it('allows the budget, then refuses with the code and the wait', () => {
    const { limiter, advance } = createClockedLimiter();
    limiter.hit('a');
    advance(MS_PER_SECOND);
    limiter.hit('a');

    const refusal = refusalOf(() => limiter.hit('a'));
    expect(refusal.code).toBe(ErrorCode.TooManyRequests);
    // The oldest attempt leaves the window one second sooner than the newest.
    expect(refusal.retryAfter).toBe(SETTINGS.windowMinutes * SECONDS_PER_MINUTE - 1);
  });

  it('counts each key on its own', () => {
    const { limiter } = createClockedLimiter();
    limiter.hit('a');
    limiter.hit('a');
    expect(() => limiter.hit('b')).not.toThrow();
  });

  it('refuses when any one key is full, and records nothing against the others', () => {
    const { limiter } = createClockedLimiter();
    limiter.hit('full');
    limiter.hit('full');
    expect(() => limiter.hit('full', 'other')).toThrow();
    // Had the refused call counted, this second attempt would be the third.
    limiter.hit('other');
    expect(() => limiter.hit('other')).not.toThrow();
  });

  it('lets an attempt through again once the oldest has left the window', () => {
    const { limiter, advance } = createClockedLimiter();
    limiter.hit('a');
    limiter.hit('a');
    advance(WINDOW_MS);
    expect(() => limiter.hit('a')).not.toThrow();
  });

  it('still counts a live key after stale ones are swept', () => {
    const { limiter, advance } = createClockedLimiter();
    limiter.hit('stale-1');
    limiter.hit('stale-2');
    advance(WINDOW_MS);
    limiter.hit('live');
    limiter.hit('live');
    expect(() => limiter.hit('live')).toThrow();
  });
});
