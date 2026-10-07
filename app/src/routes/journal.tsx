import { useQuery } from '@apollo/client/react';
import { Link, Navigate, useParams } from 'react-router';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { EntryForm, JournalDay } from '@/components/entries/entry-form';
import { RECENT_LIMIT, RecentDaysList } from '@/components/entries/recent-days';
import { PageLayout } from '@/components/page-layout';
import { QueryError } from '@/components/query-state';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { formatDay, formatFullDate, isValidIsoDate, shiftDays, todayIso } from '@/lib/date';

/**
 * The route for one day, `/:date`.
 *
 * The page under it is keyed by the date, so moving to another day mounts a fresh editor instead of carrying the last
 * day's words across.
 */
export function JournalRoute() {
  const { date } = useParams();
  const today = todayIso();

  // A hand-typed or stale URL lands on today rather than on an error: there is
  // nothing to be wrong about, and every date has an entry waiting to be written.
  const isUnknownDay = isValidIsoDate(date) === false;
  if (isUnknownDay) {
    return <Navigate to={`/${today}`} replace />;
  }

  return <JournalDayPage key={date} date={date} today={today} />;
}

/**
 * The day's entry: the failure, the placeholder or the editor, in that order.
 *
 * It owns the day's query so the page around it draws at once and this part fills in when the day arrives.
 */
function DayEntry({ date }: { date: string }) {
  const result = useQuery(JournalDay, { variables: { date } });
  const hasNothingToShow = result.data === undefined;

  if (hasNothingToShow && result.error !== undefined) {
    // A day that failed to load is not an unwritten one: an editor here would save over it.
    return <QueryError error={result.error} onRetry={() => result.refetch()} what="this day's entry" />;
  }
  if (hasNothingToShow) {
    return <CardLayout title="Entry" level={2} loading />;
  }
  return <EntryForm date={date} entry={result.data?.entry ?? null} />;
}

/** One day's page: its date, the links to the days beside it, the entry, and on a phone the recent days. */
function JournalDayPage({ date, today }: { date: string; today: string }) {
  return (
    <PageLayout
      // A journal page is a column of prose, not a dashboard: the narrow measure.
      width="prose"
      title={formatDay(date)}
      description={date === today ? formatFullDate(date) : `${formatFullDate(date)} · not today`}
      actionSlot={
        <>
          <ActionButton
            label="Previous day"
            variant="outline"
            size="icon-sm"
            iconSlot={<ChevronLeft />}
            linkSlot={<Link to={`/${shiftDays(date, -1)}`} />}
          />
          {date >= today ? (
            // A journal has nothing to say about tomorrow, so there is no link
            // to it at all — a disabled anchor is still an anchor.
            <ActionButton
              label="Next day"
              variant="outline"
              size="icon-sm"
              iconSlot={<ChevronRight />}
              disabled
              hint="Tomorrow has not happened yet"
            />
          ) : (
            <ActionButton
              label="Next day"
              variant="outline"
              size="icon-sm"
              iconSlot={<ChevronRight />}
              linkSlot={<Link to={`/${shiftDays(date, 1)}`} />}
            />
          )}
          {date !== today && (
            <Button variant="outline" size="sm" content="Back to today" linkSlot={<Link to={`/${today}`} />} />
          )}
        </>
      }
      contentSlot={
        <div className="flex flex-col gap-6">
          <DayEntry date={date} />

          {/* The rail already lists these; this is the same list for the widths that
              have no rail. */}
          <Section
            className="md:hidden"
            title="Recent"
            description={`The last ${RECENT_LIMIT} days you wrote about.`}
            contentSlot={<RecentDaysList />}
          />
        </div>
      }
    />
  );
}
