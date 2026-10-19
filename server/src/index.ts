import './core/preflight.ts';

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, db } from '@cubicecho/ephemeris-db';
import { waitForDatabase } from '@cubicecho/ephemeris-db/wait';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { type AuthHost, createAuthHost } from './auth/auth-host.ts';
import {
  appUrl,
  dbConnectTimeoutMs,
  magicLinkExposed,
  magicLinkRequired,
  oidcRedirectUri,
  port,
  secureLocalNet,
  serverUrl,
} from './core/config.ts';
import { errorMessage } from './core/errors.ts';
import { createApp } from './http/app.ts';
import { stopOnSignals } from './http/shutdown.ts';

export type { Context } from './core/context.ts';

/** Postgres's port, shown when DATABASE_URL names none. */
const DEFAULT_POSTGRES_PORT = '5432';
/** Every interface. The container's port mapping decides who can reach it. */
const LISTEN_HOST = '0.0.0.0';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Says at boot how people sign in: the OIDC provider and the redirect URI to register with it, and which sign-in
 * protections are off, naming the variable that did it.
 *
 * @param authHost - The host, built after migrate, so a paired provider is known.
 */
function describeSignIn(authHost: AuthHost): void {
  const oidc = authHost.oidc();
  if (oidc !== null) {
    // The redirect URI is the one thing an operator has to copy into the provider, exactly.
    console.log(`[auth] sign-in with ${oidc.name} (${oidc.issuer}); redirect URI ${oidcRedirectUri()}`);
  }
  const isDirectSignIn = magicLinkRequired() === false;
  if (isDirectSignIn) {
    const cause = secureLocalNet() ? 'SECURE_LOCAL_NET is on' : 'AUTH_MAGIC_LINK is off';
    console.warn(`[auth] ${cause}: any email signs in without a link. Private networks only.`);
    return;
  }
  if (magicLinkExposed()) {
    console.warn('[auth] EXPOSE_MAGIC_LINK is on: sign-in links are returned in API responses. Private networks only.');
  }
}

try {
  await waitForDatabase(db, { connectTimeoutMs: dbConnectTimeoutMs() });
} catch (error) {
  const { hostname, port: urlPort } = new URL(process.env.DATABASE_URL ?? '');
  const dbPort = urlPort === '' ? DEFAULT_POSTGRES_PORT : urlPort;
  console.error(`[db] cannot reach Postgres at ${hostname}:${dbPort}: ${errorMessage(error)}`);
  console.error('[db] check DATABASE_URL in .env, and that `npm run db:up` has started it.');
  console.error('[db] with a remote Docker daemon (`docker context ls`), set DEV_BIND=0.0.0.0 and re-run it.');
  process.exit(1);
}

// At boot, so `docker compose up` on a fresh volume is the whole install.
await migrate(db, { migrationsFolder: join(__dirname, '../../db/drizzle') });

// After migrate: the provider may be a pairing, which lives in the database.
const authHost = await createAuthHost(db);
const app = await createApp({ db, authHost, staticDir: join(__dirname, '../../app/dist') });

const server = app.listen(port(), LISTEN_HOST, () => {
  // APP_URL, not localhost: a wrong address here is the same wrong one that breaks magic links.
  console.log(`[server] ready at ${appUrl()}`);
  if (serverUrl() !== appUrl()) {
    console.log(`[server] OIDC redirects at ${serverUrl()}`);
  }
  describeSignIn(authHost);
});
stopOnSignals(server, { after: closeDatabase });
