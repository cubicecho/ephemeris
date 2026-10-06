import type { DB } from '@cubicecho/ephemeris-db';
import { createYoga } from 'graphql-yoga';
import { extractUserId } from '../auth/resolvers.ts';
import { isProduction } from '../core/config.ts';
import type { Context } from '../core/context.ts';
import { createSchema } from './build-schema.ts';
import { graphqlLogger } from './logger.ts';
import { useOperationLimits } from './operation-limits.ts';

/**
 * Builds the Yoga handler for /graphql.
 *
 * @param deps - The database resolvers read and write.
 * @returns The Yoga instance, callable as Express middleware.
 */
export function createGraphQLHandler({ db }: { db: DB }) {
  const { schema } = createSchema(db);
  return createYoga<Record<string, unknown>, Context>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: isProduction() === false,
    // Masked errors are logged here with their real cause.
    logging: graphqlLogger,
    plugins: [useOperationLimits()],
    context: ({ request }): Context => ({
      db,
      userId: extractUserId({ headers: { authorization: request.headers.get('authorization') ?? undefined } }),
    }),
  });
}
