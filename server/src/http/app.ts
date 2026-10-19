import type { DB } from '@cubicecho/ephemeris-db';
import express, { type Express } from 'express';
import { type AuthHost, createAuthHost } from '../auth/auth-host.ts';
import { createRateLimiter, type RateLimiter } from '../auth/rate-limit.ts';
import { trustProxy } from '../core/config.ts';
import { HTTP_DEFAULTS } from '../core/defaults.ts';
import { HttpStatus } from '../core/wire.ts';
import { createSchema } from '../graphql/build-schema.ts';
import { createContextFactory, createGraphQLHandler } from '../graphql/handler.ts';
import { checkHealth } from './health.ts';
import { mountSso } from './sso.ts';
import { createStaticHandler } from './static.ts';

const HEALTH_PATH = '/healthz';

/** What the app talks to. Tests pass PGlite. */
export interface AppDeps {
  db: DB;
  /**
   * Hands out the current auth instance. Tests pass a `fixedAuthHost` over one that captures links.
   *
   * @defaultValue `createAuthHost(db)`, which reads the paired provider, so migrations must have run.
   */
  authHost?: AuthHost;
  /**
   * The sign-in throttle. Tests pass one with a small budget.
   *
   * @defaultValue `createRateLimiter()`
   */
  limiter?: RateLimiter;
  /** The built SPA's directory. Left out in tests. */
  staticDir?: string;
}

/**
 * Builds the Express app: /graphql, /healthz, the two OIDC redirects and the SPA.
 *
 * @param deps - What the app talks to.
 * @returns The app, not listening.
 */
export async function createApp({ db, authHost, limiter = createRateLimiter(), staticDir }: AppDeps): Promise<Express> {
  const app = express();
  // Decides whose address `req.ip` is, which the sign-in throttle counts by.
  app.set('trust proxy', trustProxy());
  const host = authHost ?? (await createAuthHost(db));
  const { schema } = createSchema(db);
  const graphql = createGraphQLHandler(schema, createContextFactory({ db, authHost: host, limiter }));

  // Yoga reads a body Express already parsed, so this is where the size cap goes. Over it: 413.
  app.use(graphql.graphqlEndpoint, express.json({ limit: HTTP_DEFAULTS.bodyLimit }));
  // `all`, not `use`: a mounted `use` strips the path, and Yoga matches graphqlEndpoint itself.
  app.all(graphql.graphqlEndpoint, (req, res) => graphql(req, res));
  // Before the static handler, whose SPA fallback would answer 200 while the database is down.
  app.get(HEALTH_PATH, async (_req, res) => {
    const health = await checkHealth(db);
    const status = health.ok ? HttpStatus.Ok : HttpStatus.ServiceUnavailable;
    res.status(status).json(health);
  });
  // Before the static handler too, whose fallback would answer both paths with the app.
  mountSso(app, host);
  if (staticDir !== undefined) {
    const serveStatic = createStaticHandler(staticDir);
    app.use((req, res) => serveStatic(req, res));
  }
  return app;
}
