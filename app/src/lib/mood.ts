// The 1–5 scale, in one place. The server has the same range twice — a check
// constraint on the column and a readable guard in resolvers/write-guards.ts —
// and these are the words that go with it.

export const MOODS = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Low' },
  { value: 3, label: 'Even' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Great' },
] as const;

/** The radio value for "no mood recorded". A journal entry may be written without one. */
export const NO_MOOD = 'none';

export function moodLabel(mood: number | null | undefined): string | null {
  return MOODS.find((entry) => entry.value === mood)?.label ?? null;
}
