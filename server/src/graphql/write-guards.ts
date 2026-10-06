import type { BuildSchemaConfig, WriteHookPayload } from '@vantreeseba/drizzle-graphql';
import { maxBodyChars } from '../core/config.ts';
import { badInput } from '../core/errors.ts';

// Two things the generated write cannot say for itself. Both are also database
// constraints — the check on `mood`, and `text` having no length of its own is
// why the body needs one at all — so this layer exists for the message, not for
// the guarantee. A caller who typed 6 should be told the scale is 1 to 5, not
// handed `violates check constraint "ck_entries_mood_range"`.
//
// The hooks run inside the mutation's own transaction, so a throw rolls the
// write back and there is no window between the check and the write.

type Row = Record<string, unknown>;

/**
 * The rows a mutation is about to write: `values` on a create or an upsert (one
 * row or a list), `set` on an update, one `set` per entry on a batch update. A
 * delete writes nothing and so has nothing to check.
 */
export function writtenRows(args: { values?: Row | Row[]; set?: Row; updates?: Array<{ set?: Row }> }): Row[] {
  if (args.values) {
    return Array.isArray(args.values) ? args.values : [args.values];
  }
  if (args.updates) {
    return args.updates.flatMap((entry) => (entry.set ? [entry.set] : []));
  }
  return args.set ? [args.set] : [];
}

/** The mood scale, in one place: the column, this check and the client's buttons all mean 1–5. */
export const MOOD_MIN = 1;
export const MOOD_MAX = 5;

function assertEntryWritable(rows: Row[]): void {
  const limit = maxBodyChars();
  for (const row of rows) {
    // `null` is a mood the writer cleared, and is not out of range.
    if ('mood' in row && row.mood != null) {
      const mood = Number(row.mood);
      const isOffScale = Number.isInteger(mood) === false || mood < MOOD_MIN || mood > MOOD_MAX;
      if (isOffScale) {
        throw badInput(`Mood must be a whole number from ${MOOD_MIN} to ${MOOD_MAX}, or null.`);
      }
    }
    if (typeof row.body === 'string' && row.body.length > limit) {
      throw badInput(`An entry is limited to ${limit.toLocaleString()} characters.`);
    }
  }
}

export const onWrite: NonNullable<BuildSchemaConfig['onWrite']> = {
  entries: {
    before: async ({ args }: WriteHookPayload) => assertEntryWritable(writtenRows(args)),
  },
};
