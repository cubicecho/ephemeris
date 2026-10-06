import { isInputObjectType } from 'graphql';
import { beforeAll, describe, expect, it } from 'vitest';
import { OPERATION_LIMIT_DEFAULTS } from '../../core/defaults.ts';
import { createSchema } from '../../graphql/build-schema.ts';
import { createClient, createTestDb, createUser, type TestClient, type TestDb } from '../helpers.ts';

/** drizzle-graphql's code for a `limit` above `maxLimit`. */
const LIMIT_EXCEEDED = 'DRIZZLE_LIMIT_EXCEEDED';
/** The relations an entry and a user have. A nested write would add them to the write inputs. */
const RELATION_FIELDS = ['user', 'entries'];

const ENTRIES_PAGE = /* GraphQL */ `
  query EntriesPage($limit: Int) {
    entries(limit: $limit) {
      id
    }
  }
`;

describe('operation limits in the schema', () => {
  let db: TestDb;
  let writer: TestClient;

  beforeAll(async () => {
    db = await createTestDb();
    writer = createClient(db, await createUser(db, 'limits@example.com'));
  });

  it('serves a page of the largest size', async () => {
    const data = await writer.expectOk(ENTRIES_PAGE, { limit: OPERATION_LIMIT_DEFAULTS.maxPageSize });
    expect(data.entries).toEqual([]);
  });

  it('refuses a page one row over the largest size', async () => {
    const error = await writer.expectError(ENTRIES_PAGE, { limit: OPERATION_LIMIT_DEFAULTS.maxPageSize + 1 });
    expect(error.code).toBe(LIMIT_EXCEEDED);
  });

  it.each(['CreateEntryInput', 'UpdateEntryInput'])('gives %s no relation to write through', (name) => {
    const { schema } = createSchema(db);
    const input = schema.getType(name);
    const fieldNames = isInputObjectType(input) ? Object.keys(input.getFields()) : [];
    expect(fieldNames).not.toHaveLength(0);
    for (const relation of RELATION_FIELDS) {
      expect(fieldNames).not.toContain(relation);
    }
  });
});
