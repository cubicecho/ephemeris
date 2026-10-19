import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEV_SECRET, PLACEHOLDER_SECRET } from '../../core/config.ts';

// Preflight is a module that exits the process, so the only honest way to test
// it is to run it as one.

const PREFLIGHT = fileURLToPath(new URL('../../core/preflight.ts', import.meta.url));
const DATABASE_URL = 'postgres://ephemeris:ephemeris@127.0.0.1:5437/ephemeris';
const STRONG_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const ISSUER = 'https://id.example.com/oidc';
const PUBLIC_APP_URL = 'https://journal.example.com';

/**
 * Runs preflight alone under an environment.
 *
 * @param env - Variables beyond `PATH` and `DATABASE_URL`.
 * @returns The exit status and what was written to stderr.
 */
function runPreflight(env: Record<string, string>): { status: number | null; stderr: string } {
  const { status, stderr } = spawnSync(process.execPath, [PREFLIGHT], {
    env: { PATH: process.env.PATH, DATABASE_URL, ...env },
    encoding: 'utf-8',
  });
  return { status, stderr };
}

/**
 * Runs preflight in a production process.
 *
 * @param secret - The BETTER_AUTH_SECRET to run with, or undefined to leave it unset.
 * @returns The exit status and what was written to stderr.
 */
function runInProduction(secret: string | undefined): { status: number | null; stderr: string } {
  return runPreflight({ NODE_ENV: 'production', ...(secret === undefined ? {} : { BETTER_AUTH_SECRET: secret }) });
}

describe('preflight in production', () => {
  it('starts with a strong secret', () => {
    expect(runInProduction(STRONG_SECRET).status).toBe(0);
  });

  it('starts with a strong secret under the older name, JWT_SECRET', () => {
    expect(runPreflight({ NODE_ENV: 'production', JWT_SECRET: STRONG_SECRET }).status).toBe(0);
  });

  it.each([
    ['no secret', undefined],
    ['the development secret', DEV_SECRET],
    ['the secret .env.example ships with', PLACEHOLDER_SECRET],
    ['a short secret', 'hunter2'],
  ])('refuses to start with %s', (_name, secret) => {
    const { status, stderr } = runInProduction(secret);
    expect(status).toBe(1);
    expect(stderr).toContain('BETTER_AUTH_SECRET');
  });
});

describe('preflight with sign-in by address alone', () => {
  it.each([
    ['SECURE_LOCAL_NET', { SECURE_LOCAL_NET: 'true' }],
    ['AUTH_MAGIC_LINK=false', { AUTH_MAGIC_LINK: 'false' }],
  ])('refuses %s with a public APP_URL', (_name, env) => {
    const { status, stderr } = runPreflight({ ...env, APP_URL: PUBLIC_APP_URL });
    expect(status).toBe(1);
    expect(stderr).toContain('is not a private address');
  });

  it.each([
    ['the default localhost', {}],
    ['a LAN name', { APP_URL: 'http://journal.lan:3005' }],
    ['a private address', { APP_URL: 'http://192.168.1.20:3005' }],
  ])('starts on %s', (_name, env) => {
    expect(runPreflight({ SECURE_LOCAL_NET: 'true', ...env }).status).toBe(0);
  });

  it('starts with a public APP_URL when told that is on purpose', () => {
    const env = { SECURE_LOCAL_NET: 'true', APP_URL: PUBLIC_APP_URL, I_KNOW_SECURE_LOCAL_NET_IS_PUBLIC: 'true' };
    expect(runPreflight(env).status).toBe(0);
  });

  it('leaves a public APP_URL alone when links are required', () => {
    expect(runPreflight({ APP_URL: PUBLIC_APP_URL }).status).toBe(0);
  });
});

describe('preflight with an OIDC provider', () => {
  it('starts with a complete one', () => {
    const env = { OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: 'ephemeris', OIDC_CLIENT_AUTH: 'client_secret_post' };
    expect(runPreflight(env)).toEqual({ status: 0, stderr: '' });
  });

  it.each([
    ['an issuer without a client id', { OIDC_ISSUER: ISSUER }],
    ['a client id without an issuer', { OIDC_CLIENT_ID: 'ephemeris' }],
  ])('refuses %s', (_name, env) => {
    const { status, stderr } = runPreflight(env);
    expect(status).toBe(1);
    expect(stderr).toContain('OIDC_ISSUER and OIDC_CLIENT_ID go together');
  });

  it('refuses an issuer that is not a URL', () => {
    const { status, stderr } = runPreflight({ OIDC_ISSUER: 'id.example.com', OIDC_CLIENT_ID: 'ephemeris' });
    expect(status).toBe(1);
    expect(stderr).toContain('OIDC_ISSUER is not a URL');
  });

  it('refuses a client auth method it does not know', () => {
    const env = { OIDC_ISSUER: ISSUER, OIDC_CLIENT_ID: 'ephemeris', OIDC_CLIENT_AUTH: 'jwt' };
    const { status, stderr } = runPreflight(env);
    expect(status).toBe(1);
    expect(stderr).toContain('OIDC_CLIENT_AUTH must be one of');
  });
});
