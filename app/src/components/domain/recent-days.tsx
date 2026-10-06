import { useQuery } from '@apollo/client/react';
import { BookOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { graphql } from '@/__generated__';
import { MoodDot } from '@/components/domain/mood-scale';
import { RailLink } from '@/components/layouts/rail-link';
import { EmptyState } from '@/components/page';
import { QueryState } from '@/components/query-state';
import { SidebarSection } from '@/components/sidebar';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { formatDay, formatFullDate } from '@/lib/date';
import { moodLabel } from '@/lib/mood';
import { queryLike } from '@/lib/query';
import { cn } from '@/lib/utils';

/** How far back the days go, in both places that draw them. */
export const RECENT_LIMIT = 30;

/**
 * Its own document rather than a field on `JournalDay`, because the rail draws
 * it beside every day and the page draws it under one. Apollo normalises both
 * onto the same cached rows, so the second caller costs nothing.
 */
export const RecentEntries = graphql(`
  query RecentEntries {
    entries(orderBy: { entryDate: { direction: desc, priority: 1 } }, limit: 30) {
      id
      entryDate
      body
      mood
    }
  }
`);

export function useRecentEntries() {
  return useQuery(RecentEntries);
}

/**
 * The days in the sidebar: the same rows other apps use for their sections,
 * because on a one-page app the days *are* the sections — which is also why
 * this one is a navigation landmark and not just a list.
 *
 * A row's mood is its `status`: the row reads "Today, Good" and draws the
 * swatch, so the dot is told to stay silent rather than say the word twice.
 */
export function RecentDaysSection({ today }: { today: string }) {
  const result = useRecentEntries();
  const entries = result.data?.entries ?? [];

  return (
    <SidebarSection
      as="nav"
      title="Recent"
      label="Recent days"
      actionSlot={
        result.data ? (
          <span className="px-1 text-foreground/60 text-xs tabular-nums">
            <span aria-hidden>
              {entries.length}/{RECENT_LIMIT}
            </span>
            <span className="sr-only">
              {entries.length} of the last {RECENT_LIMIT} days written
            </span>
          </span>
        ) : null
      }
      status={
        <QueryState
          compact
          className="px-2"
          query={queryLike(result)}
          what="your entries"
          count={entries.length}
          emptySlot={<EmptyState compact className="px-2" title="Nothing written yet." />}
        />
      }
      contentSlot={entries.map((entry) => {
        const mood = moodLabel(entry.mood);
        return (
          <RailLink
            key={entry.id}
            to={`/${entry.entryDate}`}
            label={entry.entryDate === today ? 'Today' : formatDay(entry.entryDate)}
            status={mood ? { label: mood, iconSlot: <MoodDot mood={entry.mood} silent /> } : undefined}
          />
        );
      })}
    />
  );
}

/**
 * The same days as cards, for the screens too narrow to have a rail. Kept in one
 * file with the rail so the two cannot drift about what "recent" means.
 *
 * Each card is one plain link — `Item asChild` over a `NavLink` — rather than a
 * row with a button in it: every day is a URL, and a card you can middle-click
 * is the whole point of that.
 */
export function RecentDaysList({ className }: { className?: string }) {
  const result = useRecentEntries();
  const entries = result.data?.entries ?? [];

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <QueryState
        query={queryLike(result)}
        what="your entries"
        count={entries.length}
        emptySlot={
          <EmptyState
            icon={BookOpen}
            title="Nothing written yet"
            description="Today's entry will show up here once you save it."
          />
        }
      />
      {entries.map((entry) => (
        <Item key={entry.id} asChild variant="outline">
          <NavLink to={`/${entry.entryDate}`}>
            <ItemContent>
              <ItemTitle>
                {formatFullDate(entry.entryDate)}
                <MoodDot mood={entry.mood} label className="ml-2" />
              </ItemTitle>
              <ItemDescription>{entry.body.trim() || 'No words that day.'}</ItemDescription>
            </ItemContent>
          </NavLink>
        </Item>
      ))}
    </div>
  );
}
