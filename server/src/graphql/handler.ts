import type { DB } from '@cubicecho/ephemeris-db';
import { createYoga } from 'graphql-yoga';
import { extractUserId } from '../auth/resolvers.ts';
import type { Context } from '../core/context.ts';
import { createSchema } from './build-schema.ts';

export function createGraphQLHandler({ db }: { db: DB }) {
  const { schema } = createSchema(db);
  return createYoga<Record<string, unknown>, Context>({
    schema,
    graphqlEndpoint: '/graphql',
    graphiql: process.env.NODE_ENV !== 'production',
    context: ({ request }): Context => ({
      db,
      userId: extractUserId({ headers: { authorization: request.headers.get('authorization') ?? undefined } }),
    }),
  });
}
