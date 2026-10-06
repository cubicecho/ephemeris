import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Preflight is a module that exits the process, so the only honest way to test
// it is to run it as one.

const PREFLIGHT = fileURLToPath(new URL('../../core/preflight.ts', import.meta.url));
const DATABASE_URL = 'postgres://ephemeris:ephemeris@127.0.0.1:5437/ephemeris';
const STRONG_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/**
 * Runs preflight in a production process.
 *
 * @param jwtSecret - The JWT_SECRET to run with, or undefined to leave it unset.
 * @returns The exit status and what was written to stderr.
 */
function runInProduction(jwtSecret: string | undefined): { status: number | null; stderr: string } {
  const secretEnv = jwtSecret === undefined ? {} : { JWT_SECRET: jwtSecret };
  const { status, stderr } = spawnSync(process.execPath, [PREFLIGHT], {
    env: { PATH: process.env.PATH, NODE_ENV: 'production', DATABASE_URL, ...secretEnv },
    encoding: 'utf-8',
  });
  return { status, stderr };
}

describe('preflight in production', () => {
  it('starts with a strong secret', () => {
    expect(runInProduction(STRONG_SECRET).status).toBe(0);
  });

  it.each([
    ['no secret', undefined],
    ['the development secret', 'dev-secret-change-in-production'],
    ['the secret .env.example ships with', 'change-me-to-a-long-random-string'],
    ['a short secret', 'hunter2'],
  ])('refuses to start with %s', (_name, secret) => {
    const { status, stderr } = runInProduction(secret);
    expect(status).toBe(1);
    expect(stderr).toContain('JWT_SECRET');
  });
});
