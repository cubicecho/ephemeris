import type { DB } from '@cubicecho/ephemeris-db';
import type { Request } from 'express';
import { createYoga } from 'graphql-yoga';
import type { RateLimiter } from '../auth/rate-limit.ts';
import { extractUserId } from '../auth/resolvers.ts';
import { isProduction } from '../core/config.ts';
import { type Context, UNKNOWN_IP } from '../core/context.ts';
import { createSchema } from './build-schema.ts';
import { graphqlLogger } from './logger.ts';
import { useOperationLimits } from './operation-limits.ts';

/** What Express hands Yoga alongside the fetch `Request`. */
interface ServerContext {
  /** The Express request. Absent when the handler is called without Express. */
  req?: Request;
}

/** What every request's context is built from. */
export interface GraphQLDeps {
  db: DB;
  limiter: RateLimiter;
}

/**
 * Builds the Yoga handler for /graphql.
 *
 * @param deps - The database resolvers read and write, and the sign-in throttle.
 * @returns The Yoga instance, callable as Express middleware.
 */
export function createGraphQLHandler({ db, limiter }: GraphQLDeps) {
  const { schema } = createSchema(db);
  return createYoga<ServerContext, Context>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: isProduction() === false,
    // Masked errors are logged here with their real cause.
    logging: graphqlLogger,
    plugins: [useOperationLimits()],
    context: ({ request, req }): Context => ({
      db,
      limiter,
      ip: req?.ip ?? UNKNOWN_IP,
      userId: extractUserId({ headers: { authorization: request.headers.get('authorization') ?? undefined } }),
    }),
  });
}
