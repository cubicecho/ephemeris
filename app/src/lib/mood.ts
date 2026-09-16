// The 1–5 scale, in one place. The server has the same range twice — a check
// constraint on the column and a readable guard in resolvers/write-guards.ts —
// and these are the words that go with it.

/**
 * The scale, low to high, each step carrying the swatch that draws it. The
 * colours are `--mood-*` tokens from `index.css` rather than palette utilities,
 * so one ramp serves both themes.
 *
 * **`dark:` repeats the class on purpose.** The vendored `RadioGroupItem` ships
 * a `dark:bg-input/30`, and `tailwind-merge` only resolves a conflict between
 * two classes under the *same* variant — an unprefixed `bg-mood-3` loses to it
 * the moment the page goes dark, silently and only in one theme.
 */
export const MOODS = [
  { value: 1, label: 'Rough', swatch: 'bg-mood-1 dark:bg-mood-1' },
  { value: 2, label: 'Low', swatch: 'bg-mood-2 dark:bg-mood-2' },
  { value: 3, label: 'Even', swatch: 'bg-mood-3 dark:bg-mood-3' },
  { value: 4, label: 'Good', swatch: 'bg-mood-4 dark:bg-mood-4' },
  { value: 5, label: 'Great', swatch: 'bg-mood-5 dark:bg-mood-5' },
] as const;

/** The radio value for "no mood recorded". A journal entry may be written without one. */
export const NO_MOOD = 'none';

export function moodLabel(mood: number | null | undefined): string | null {
  return MOODS.find((entry) => entry.value === mood)?.label ?? null;
}

/** The background class for a mood, or `null` for the day nobody rated. */
export function moodSwatch(mood: number | null | undefined): string | null {
  return MOODS.find((entry) => entry.value === mood)?.swatch ?? null;
}
