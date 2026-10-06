import type { DB } from '@cubicecho/ephemeris-db';
import express, { type Express } from 'express';
import { HTTP_DEFAULTS } from '../core/defaults.ts';
import { HttpStatus } from '../core/wire.ts';
import { createGraphQLHandler } from '../graphql/handler.ts';
import { checkHealth } from './health.ts';
import { createStaticHandler } from './static.ts';

const HEALTH_PATH = '/healthz';

/** What the app talks to. Tests pass PGlite. */
export interface AppDeps {
  db: DB;
  /** The built SPA's directory. Left out in tests. */
  staticDir?: string;
}

/**
 * Builds the Express app: /graphql, /healthz and the SPA.
 *
 * @param deps - What the app talks to.
 * @returns The app, not listening.
 */
export function createApp({ db, staticDir }: AppDeps): Express {
  const app = express();
  const graphql = createGraphQLHandler({ db });

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
  if (staticDir !== undefined) {
    const serveStatic = createStaticHandler(staticDir);
    app.use((req, res) => serveStatic(req, res));
  }
  return app;
}
