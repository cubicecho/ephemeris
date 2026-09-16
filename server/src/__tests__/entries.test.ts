import * as dbSchema from '@cubicecho/ephemeris-db/schema';
import { beforeEach, describe, expect, it } from 'vitest';
import { createClient, createTestDb, createUser, type TestClient, type TestDb } from './helpers.ts';

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

  it('refuses to answer at all without a caller', async () => {
    const anonymous = createClient(db, null);
    expect((await anonymous.expectError(LIST)).code).toBe('UNAUTHENTICATED');
    expect((await anonymous.expectError(SAVE, { date: '2026-09-15', body: 'x', mood: null })).code).toBe(
      'UNAUTHENTICATED',
    );
  });
});

describe('what an entry may contain', () => {
  it.each([0, 6, -1])('refuses a mood of %i', async (mood) => {
    const error = await mine.expectError(SAVE, { date: '2026-09-15', body: 'Off the scale.', mood });
    expect(error.code).toBe('BAD_USER_INPUT');
    expect(error.message).toContain('1 to 5');

    // The hook runs inside the mutation's transaction, so nothing was written.
    expect(await db.select().from(dbSchema.entries)).toHaveLength(0);
  });

  it('refuses a body past the limit', async () => {
    process.env.MAX_BODY_CHARS = '16';
    try {
      const error = await mine.expectError(SAVE, { date: '2026-09-15', body: 'x'.repeat(17), mood: null });
      expect(error.code).toBe('BAD_USER_INPUT');
      expect(error.message).toContain('16 characters');
    } finally {
      delete process.env.MAX_BODY_CHARS;
    }
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
