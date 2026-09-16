import { useQuery } from '@apollo/client/react';
import { BookOpen } from 'lucide-react';
import { NavLink } from 'react-router';
import { graphql } from '@/__generated__';
import { QueryState } from '@/components/query-state';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Item, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item';
import { Skeleton } from '@/components/ui/skeleton';
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
 * The days in the sidebar: the same nav-link shape the other apps use for their
 * sections, because on a one-page app the days *are* the sections.
 */
export function RecentDaysNav({ today }: { today: string }) {
  const { data, loading } = useRecentEntries();
  const entries = data?.entries ?? [];

  if (loading && !data) {
    return (
      <div className="flex flex-col gap-2 px-3 py-2">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
    );
  }
  if (entries.length === 0) {
    return <p className="px-3 py-2 text-muted-foreground text-sm">Nothing written yet.</p>;
  }

  return (
    <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-2 pb-2" aria-label="Recent days">
      {entries.map((entry) => (
        <NavLink
          key={entry.id}
          to={`/${entry.entryDate}`}
          className={({ isActive }) =>
            cn(
              'flex items-center justify-between gap-2 rounded-md px-3 py-2 text-sm',
              isActive
                ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
            )
          }
        >
          <span className="min-w-0 truncate">{entry.entryDate === today ? 'Today' : formatDay(entry.entryDate)}</span>
          {entry.mood ? <span className="shrink-0 text-muted-foreground text-xs">{entry.mood}</span> : null}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * The same days as cards, for the screens too narrow to have a rail. Kept in one
 * file with the rail so the two cannot drift about what "recent" means.
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
        empty={
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BookOpen />
              </EmptyMedia>
              <EmptyTitle>Nothing written yet</EmptyTitle>
              <EmptyDescription>Today's entry will show up here once you save it.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        }
      />
      {entries.map((entry) => (
        <Item key={entry.id} asChild variant="outline">
          <NavLink to={`/${entry.entryDate}`}>
            <ItemContent>
              <ItemTitle>
                {formatFullDate(entry.entryDate)}
                {moodLabel(entry.mood) && (
                  <span className="ml-2 font-normal text-muted-foreground">{moodLabel(entry.mood)}</span>
                )}
              </ItemTitle>
              <ItemDescription>{entry.body.trim() || 'No words that day.'}</ItemDescription>
            </ItemContent>
          </NavLink>
        </Item>
      ))}
    </div>
  );
}
