import type { ComponentProps } from 'react';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { MOODS, moodLabel, moodSwatch, NO_MOOD } from '@/lib/mood';
import { cn } from '@/lib/utils';

/** How a mood's word travels with its swatch. */
type MoodWording = 'printed' | 'spoken' | 'none';

const WORD_CLASSES = {
  printed: 'font-normal text-foreground/60',
  spoken: 'sr-only',
} as const;

interface MoodDotProps {
  /** The mood on the 1–5 scale. A day with none draws nothing. */
  mood: number | null | undefined;
  /**
   * Where the word goes. `printed` puts it beside the swatch, where there is room: the cards. `spoken` (the default)
   * keeps it for a screen reader and the swatch's title. `none` is for the one caller that says the word itself: a
   * cubeui sidebar row puts it in the row's name, and a second copy here would be read twice.
   */
  wording?: MoodWording;
  className?: string;
}

/**
 * A recorded mood, as its place on the spectrum rather than as its number. "4"
 * only means anything to someone holding the scale in their head; the colour is
 * the scale, which is what makes a column of days readable at a glance.
 *
 * The word always goes with it, because a colour alone is a value only someone
 * who can see it and knows the ramp can read, so the announcement is "Good",
 * never "swatch".
 *
 * A day with no mood draws nothing rather than a grey dot: "not recorded" is an
 * absence, and a placeholder in the row is exactly the reading — a middling 3 —
 * that the nullable column exists to avoid.
 */
export function MoodDot({ mood, wording = 'spoken', className }: MoodDotProps) {
  const text = moodLabel(mood);
  const swatch = moodSwatch(mood);
  if (!text || !swatch) {
    return null;
  }

  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5', className)}>
      <span
        aria-hidden
        title={wording === 'printed' ? undefined : text}
        className={cn('size-2.5 rounded-full', swatch)}
      />
      {wording !== 'none' && <span className={WORD_CLASSES[wording]}>{text}</span>}
    </span>
  );
}

/**
 * The mood picker: the five steps laid out as the ramp they are, red to green,
 * plus the sixth option of not saying.
 *
 * It is still cubeui's `RadioGroup` — arrow keys, roving tabindex, one tab stop —
 * because a row of swatches is a radio group that has been painted, not a new
 * control. Each swatch is the primitive's bare item with a real
 * `<label htmlFor>` under it, so the word is the button's accessible name and is
 * also a second place to click it.
 *
 * **Every step stays at full colour, and only the ring says which one is
 * chosen.** Dimming the other four is the obvious way to draw a selection and it
 * destroys the thing being drawn: at 40% over `--background` the ramp washes out
 * to pastel in the light theme, and over the dark one it goes muddy — steps 1
 * and 2 land on the same brown, which is a spectrum that no longer runs from
 * anything to anything.
 */
export function MoodSpectrum(props: ComponentProps<typeof RadioGroup>) {
  return (
    <RadioGroup {...props}>
      <div className="flex items-start gap-1">
        {MOODS.map((option) => (
          <div key={option.value} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <RadioGroupItem
              id={`mood-${option.value}`}
              value={String(option.value)}
              hint={option.label}
              className={cn(
                // A bare item is a 16px circle; this makes it the swatch instead.
                // The circle inside is hidden because on a coloured field it is
                // a second, weaker mark for what the ring already says.
                'peer h-9 w-full shrink rounded-md transition-all [&>div]:hidden',
                option.swatch,
                'hover:brightness-95 dark:hover:brightness-110',
                'aria-checked:ring-2 aria-checked:ring-active aria-checked:ring-offset-2 aria-checked:ring-offset-background',
              )}
            />
            <Label
              htmlFor={`mood-${option.value}`}
              className="truncate font-normal text-foreground/60 text-xs peer-aria-checked:font-medium peer-aria-checked:text-foreground"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>

      <RadioGroupItem value={NO_MOOD} label="Not recorded" />
    </RadioGroup>
  );
}
