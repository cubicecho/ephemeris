import { z } from 'zod';
import type { EntrySettings } from '../core/defaults.ts';

/** The mood scale. Not a setting: the column's check constraint and the client's buttons mean the same 1 to 5. */
export const MOOD_MIN = 1;
export const MOOD_MAX = 5;

const MOOD_MESSAGE = `Mood must be a whole number from ${MOOD_MIN} to ${MOOD_MAX}, or null.`;

/** `null` is a mood the writer cleared, and is not off the scale. */
const moodSchema = z
  .number(MOOD_MESSAGE)
  .int(MOOD_MESSAGE)
  .min(MOOD_MIN, MOOD_MESSAGE)
  .max(MOOD_MAX, MOOD_MESSAGE)
  .nullable();

/**
 * Builds the schema an entry's written columns must pass.
 *
 * @param settings - The limits in force, which an operator may have changed.
 * @returns A partial schema, since an update's `set` carries only the changed columns.
 */
export function createEntryInput(settings: EntrySettings) {
  const { maxBodyLength } = settings;
  const bodySchema = z
    .string()
    .max(maxBodyLength, `An entry is limited to ${maxBodyLength.toLocaleString()} characters.`);
  return z.object({ body: bodySchema, mood: moodSchema }).partial();
}
