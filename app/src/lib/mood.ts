// The 1–5 scale, in one place. The server has the same range twice — a check
// constraint on the column and a readable guard in entries/input.ts —
// and these are the words that go with it.

/**
 * The scale, low to high, each step carrying the swatch that draws it. The
 * colours are `--mood-*` tokens from `index.css` rather than palette utilities,
 * so one ramp serves both themes.
 *
 * **`focus-visible:` repeats the class on purpose.** cubeui's bare
 * `RadioGroupItem` ships a `focus-visible:bg-hover`, and `tailwind-merge` only
 * resolves a conflict between two classes under the *same* variant — an
 * unprefixed `bg-mood-3` loses to it the moment the swatch takes keyboard focus,
 * which in a radio group is the chosen one: the step you picked would be the
 * one step drawn in the wrong colour.
 */
export const MOODS = [
  { value: 1, label: 'Rough', swatch: 'bg-mood-1 focus-visible:bg-mood-1' },
  { value: 2, label: 'Low', swatch: 'bg-mood-2 focus-visible:bg-mood-2' },
  { value: 3, label: 'Even', swatch: 'bg-mood-3 focus-visible:bg-mood-3' },
  { value: 4, label: 'Good', swatch: 'bg-mood-4 focus-visible:bg-mood-4' },
  { value: 5, label: 'Great', swatch: 'bg-mood-5 focus-visible:bg-mood-5' },
] as const;

/** The radio value for "no mood recorded". A journal entry may be written without one. */
export const NO_MOOD = 'none';

/**
 * The word for a step on the scale.
 *
 * @param mood - 1 to 5, or nothing for a day with no mood recorded.
 * @returns The step's label, or null when the value is not a step.
 */
export function moodLabel(mood: number | null | undefined): string | null {
  return MOODS.find((entry) => entry.value === mood)?.label ?? null;
}

/**
 * The colour for a step on the scale.
 *
 * @param mood - 1 to 5, or nothing for a day with no mood recorded.
 * @returns The step's background classes, or null for the day nobody rated.
 */
export function moodSwatch(mood: number | null | undefined): string | null {
  return MOODS.find((entry) => entry.value === mood)?.swatch ?? null;
}
