import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { ENTRY_DEFAULTS } from '../../core/defaults.ts';
import { ErrorCode } from '../../core/errors.ts';
import { createClient, createTestDb, createUser, type TestClient, type TestDb } from '../helpers.ts';

// One entry per person per day is the whole data model, and `upsertEntry` is the
// only thing that maintains it. These are the ways that could go wrong: a second
// save for the same day, a save that reaches another writer's day, and a mood
// off the scale.

const SAVE = `
  mutation($date: String!, $body: String!, $mood: Int) {
    upsertEntry(
      values: { entryDate: $date, body: $body, mood: $mood }
      onConflict: { target: [userId, entryDate], update: [body, mood] }
    ) { id entryDate body mood }
  }
`;

const LIST = `query { entries(orderBy: { entryDate: { direction: desc, priority: 1 } }) { entryDate body mood } }`;
const UPDATE_BY_ID = `
  mutation($id: UUID!, $body: String!) { updateEntries(where: { id: { eq: $id } }, set: { body: $body }) { id } }
`;
const DELETE_BY_ID = `mutation($id: UUID!) { deleteEntries(where: { id: { eq: $id } }) { id } }`;
const DAY = `query($date: String!) { entry(where: { entryDate: { eq: $date } }) { id body mood } }`;

let db: TestDb;
let mine: TestClient;
let theirs: TestClient;

beforeEach(async () => {
  db = await createTestDb();
  mine = createClient(db, await createUser(db, 'mine@example.com'));
  theirs = createClient(db, await createUser(db, 'theirs@example.com'));
});

describe('saving a day', () => {
  it('writes an entry the first time and rewrites the same row the second', async () => {
    const first = (await mine.expectOk(SAVE, { date: '2026-09-15', body: 'A start.', mood: 4 })).upsertEntry;
    expect(first).toMatchObject({ entryDate: '2026-09-15', body: 'A start.', mood: 4 });

    const second = (await mine.expectOk(SAVE, { date: '2026-09-15', body: 'Reconsidered.', mood: 3 })).upsertEntry;
    // Same id: the second save edited the day rather than adding a second one.
    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({ body: 'Reconsidered.', mood: 3 });

    const rows = await db.select().from(dbSchema.entries);
    expect(rows).toHaveLength(1);
  });

  it('keeps separate days separate', async () => {
    await mine.expectOk(SAVE, { date: '2026-09-14', body: 'Yesterday.', mood: 2 });
    await mine.expectOk(SAVE, { date: '2026-09-15', body: 'Today.', mood: null });

    const { entries } = await mine.expectOk(LIST);
    expect(entries).toEqual([
      { entryDate: '2026-09-15', body: 'Today.', mood: null },
      { entryDate: '2026-09-14', body: 'Yesterday.', mood: 2 },
    ]);
  });

  it('clears a mood back to null', async () => {
    await mine.expectOk(SAVE, { date: '2026-09-15', body: 'Rated.', mood: 5 });
    const cleared = (await mine.expectOk(SAVE, { date: '2026-09-15', body: 'Rated.', mood: null })).upsertEntry;
    expect(cleared.mood).toBeNull();
  });
});

describe('one writer cannot reach another', () => {
  it('gives two writers the same day without collision', async () => {
    const ours = (await mine.expectOk(SAVE, { date: '2026-09-15', body: 'Mine.', mood: 4 })).upsertEntry;
    const others = (await theirs.expectOk(SAVE, { date: '2026-09-15', body: 'Theirs.', mood: 1 })).upsertEntry;

    // The unique constraint is (userId, entryDate), so the same date is two rows.
    expect(others.id).not.toBe(ours.id);
    expect(await db.select().from(dbSchema.entries)).toHaveLength(2);
  });

  it('shows a writer only their own days', async () => {
    await theirs.expectOk(SAVE, { date: '2026-09-15', body: 'Theirs.', mood: 1 });

    expect((await mine.expectOk(LIST)).entries).toEqual([]);
    expect((await mine.expectOk(DAY, { date: '2026-09-15' })).entry).toBeNull();
  });

  it("leaves another writer's day alone on update and delete", async () => {
    const others = (await theirs.expectOk(SAVE, { date: '2026-09-15', body: 'Theirs.', mood: 1 })).upsertEntry;

    // Naming the row by id is as far as a caller can reach: scope is ANDed into the WHERE.
    const updated = await mine.expectOk(UPDATE_BY_ID, { id: others.id, body: 'Overwritten.' });
    expect(updated.updateEntries).toEqual([]);
    const deleted = await mine.expectOk(DELETE_BY_ID, { id: others.id });
    expect(deleted.deleteEntries).toEqual([]);

    const [row] = await db.select().from(dbSchema.entries);
    expect(row).toMatchObject({ id: others.id, body: 'Theirs.' });
  });

  it('refuses to answer at all without a caller', async () => {
    const anonymous = createClient(db, null);
    expect((await anonymous.expectError(LIST)).code).toBe(ErrorCode.Unauthenticated);
    expect((await anonymous.expectError(SAVE, { date: '2026-09-15', body: 'x', mood: null })).code).toBe(
      ErrorCode.Unauthenticated,
    );
  });
});

describe('what an entry may contain', () => {
  it.each([0, 6, -1])('refuses a mood of %i', async (mood) => {
    const error = await mine.expectError(SAVE, { date: '2026-09-15', body: 'Off the scale.', mood });
    expect(error.code).toBe(ErrorCode.BadUserInput);

    // The hook runs inside the mutation's transaction, so nothing was written.
    expect(await db.select().from(dbSchema.entries)).toHaveLength(0);
  });

  it('refuses a body past the limit', async () => {
    const body = 'x'.repeat(ENTRY_DEFAULTS.maxBodyLength + 1);
    const error = await mine.expectError(SAVE, { date: '2026-09-15', body, mood: null });
    expect(error.code).toBe(ErrorCode.BadUserInput);
    expect(await db.select().from(dbSchema.entries)).toHaveLength(0);
  });

  it('takes a body exactly at the limit', async () => {
    const body = 'x'.repeat(ENTRY_DEFAULTS.maxBodyLength);
    const saved = (await mine.expectOk(SAVE, { date: '2026-09-15', body, mood: null })).upsertEntry;
    expect(saved.body).toHaveLength(ENTRY_DEFAULTS.maxBodyLength);
  });

  it('will not take a userId from the caller', async () => {
    // `contextValues` stamps it, which also removes it from the input type — a
    // caller naming someone else's id is a schema error, not a check we run.
    const result = await mine.run(
      `mutation($u: UUID!) { createEntry(values: { userId: $u, entryDate: "2026-09-15", body: "x" }) { id } }`,
      { u: '00000000-0000-0000-0000-000000000000' },
    );
    expect(result.errors?.[0]?.message).toMatch(/userId/);
  });
});
