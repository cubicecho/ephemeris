// What every table's write hooks share. Imports no domain folder.

/** One written row: column values by TS key. */
export type Row = Record<string, unknown>;

/** The arguments a generated write can carry rows in. */
interface WriteArgs {
  /** Rows on create or upsert. */
  values?: Row | Row[];
  /** The changed columns on update. */
  set?: Row;
  /** One entry per statement on batch update. */
  updates?: Array<{ set?: Row }>;
}

/**
 * Collects the rows a write supplies. A delete supplies none.
 *
 * @param args - Mutation args.
 * @returns One row per written set.
 */
export function writtenRows(args: WriteArgs): Row[] {
  if (args.values !== undefined) {
    return Array.isArray(args.values) ? args.values : [args.values];
  }
  if (args.updates !== undefined) {
    return args.updates.flatMap((update) => (update.set === undefined ? [] : [update.set]));
  }
  if (args.set !== undefined) {
    return [args.set];
  }
  return [];
}
