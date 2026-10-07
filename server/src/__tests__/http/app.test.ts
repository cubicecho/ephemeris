import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { OPERATION_LIMIT_DEFAULTS } from '../../core/defaults.ts';
import { ErrorCode } from '../../core/errors.ts';
import { HttpStatus } from '../../core/wire.ts';
import { createApp } from '../../http/app.ts';
import { createTestDb, portOf } from '../helpers.ts';

/** Just over `HTTP_DEFAULTS.bodyLimit`, which is 1 MB. */
const OVERSIZED_PADDING_BYTES = 1_100_000;
const LOOPBACK = '127.0.0.1';

const TODAY_QUERY = /* GraphQL */ `
  query Today {
    entries {
      id
    }
  }
`;

/** `maxDepth` is 8. This nests ten selections. */
const TOO_DEEP_QUERY = /* GraphQL */ `
  query TooDeep {
    entries {
      user {
        entries {
          user {
            entries {
              user {
                entries {
                  user {
                    entries {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

/** Two full pages nested: 500 rows, each with 500 more, against a `maxCost` of 10,000. */
const TOO_COSTLY_QUERY = /* GraphQL */ `
  query TooCostly($limit: Int) {
    entries(limit: $limit) {
      user {
        entries(limit: $limit) {
          id
        }
      }
    }
  }
`;

/**
 * Builds a query that asks for one field under more aliases than `maxAliases` allows.
 *
 * @returns The query text.
 */
const tooAliasedQuery = (): string => {
  const aliases = Array.from(
    { length: OPERATION_LIMIT_DEFAULTS.maxAliases + 1 },
    (_, index) => `a${index}: entries { id }`,
  );
  return `query TooAliased { ${aliases.join(' ')} }`;
};

describe('the HTTP app', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const db = await createTestDb();
    const app = createApp({ db });
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, LOOPBACK, () => resolve(listening));
    });
    baseUrl = `http://${LOOPBACK}:${portOf(server)}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  /**
   * Posts one JSON body to /graphql over the socket.
   *
   * @param body - The request body.
   * @returns The response.
   */
  const postGraphql = (body: Record<string, unknown>): Promise<Response> =>
    fetch(`${baseUrl}/graphql`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('reports healthy with the version once the database answers', async () => {
    const response = await fetch(`${baseUrl}/healthz`);
    expect(response.status).toBe(HttpStatus.Ok);
    const health = await response.json();
    expect(health.ok).toBe(true);
    expect(health.version).toEqual(expect.any(String));
  });

  it('refuses a signed-out query by code', async () => {
    const response = await postGraphql({ query: TODAY_QUERY });
    const { errors } = await response.json();
    expect(errors[0].extensions.code).toBe(ErrorCode.Unauthenticated);
  });

  it('refuses a query nested past the depth limit', async () => {
    const response = await postGraphql({ query: TOO_DEEP_QUERY });
    const { errors } = await response.json();
    expect(errors[0].extensions.code).toBe(ErrorCode.QueryTooComplex);
  });

  it('refuses a query with more aliases than the limit', async () => {
    const response = await postGraphql({ query: tooAliasedQuery() });
    const { errors } = await response.json();
    expect(errors[0].extensions.code).toBe(ErrorCode.QueryTooComplex);
  });

  it('refuses a query that costs more than the limit, priced with its variables', async () => {
    const variables = { limit: OPERATION_LIMIT_DEFAULTS.maxPageSize };
    const response = await postGraphql({ query: TOO_COSTLY_QUERY, variables });
    const { errors } = await response.json();
    expect(errors[0].extensions.code).toBe(ErrorCode.QueryTooComplex);
    expect(errors[0].message).toMatch(/^Query cost \d+ exceeds/);
  });

  it('refuses a body over the cap with 413', async () => {
    const response = await postGraphql({ query: TODAY_QUERY, padding: 'x'.repeat(OVERSIZED_PADDING_BYTES) });
    expect(response.status).toBe(HttpStatus.PayloadTooLarge);
  });
});
