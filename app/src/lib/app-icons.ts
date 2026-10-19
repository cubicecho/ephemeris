/**
 * The glyphs this app draws that `@cubeui/icons` does not ship, and the one file that names `lucide-react`.
 *
 * cubeui's set is curated and a glyph only joins it once a second app wraps it, so these stay the app's. They go
 * through cubeui's `icon` anyway, so every icon in the app is spelled the same way and comes from one of two places:
 * `@/components/ui/icons` for the set, and here for the rest. Do not add them to `icons.tsx` — the next
 * `shadcn add` of `@cubeui/icons` overwrites it.
 */
import { BookOpen as BookOpenSource, CalendarDays as CalendarDaysSource, LogOut as LogOutSource } from 'lucide-react';
import { icon } from '@/components/ui/icons';

/** The app's mark: the brand in the sidebar, the bar and the login card, and the empty journal. */
export const BookOpen = icon(BookOpenSource);
/** Today, the one link that is always the same place. */
export const CalendarDays = icon(CalendarDaysSource);
/** Sign out. */
export const LogOut = icon(LogOutSource);
