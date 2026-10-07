import { useMutation, useQuery } from '@apollo/client/react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { graphql } from '@/__generated__';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { RECENT_LIMIT, RecentDaysList, RecentEntries } from '@/components/entries/recent-days';
import { FormField } from '@/components/form-field';
import { MoodSpectrum } from '@/components/mood/mood-scale';
import { PageLayout } from '@/components/page-layout';
import { QueryError } from '@/components/query-state';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from '@/components/ui/icons';
import { Textarea } from '@/components/ui/textarea';
import { formatDay, formatFullDate, isValidIsoDate, shiftDays, todayIso } from '@/lib/date';
import { NO_MOOD } from '@/lib/mood';

export const JournalDay = graphql(`
  query JournalDay($date: String!) {
    entry(where: { entryDate: { eq: $date } }) {
      id
      entryDate
      body
      mood
    }
  }
`);

// One mutation for both halves of "save what I have for today". The conflict
// target is the (userId, entryDate) unique constraint — `userId` never leaves
// the server, so the client names the column without ever supplying a value —
// and `update` lists only the two columns a writer owns, so a re-save cannot
// touch `id` or `createdAt`.
const SaveEntry = graphql(`
  mutation SaveEntry($date: String!, $body: String!, $mood: Int) {
    upsertEntry(
      values: { entryDate: $date, body: $body, mood: $mood }
      onConflict: { target: [userId, entryDate], update: [body, mood] }
    ) {
      id
      entryDate
      body
      mood
    }
  }
`);

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

function JournalDayPage({ date, today }: { date: string; today: string }) {
  const result = useQuery(JournalDay, { variables: { date } });
  const { data } = result;
  const entry = data?.entry ?? null;
  const hasFailedToLoad = result.error !== undefined && data === undefined;

  const [body, setBody] = useState('');
  const [mood, setMood] = useState<string>(NO_MOOD);
  const [saved, setSaved] = useState(false);

  // The server's copy is the starting point, not the running value: re-seeding
  // the boxes on every result would overwrite what is being typed each time the
  // cache-and-network refetch lands. `key={date}` remounts on a day change, so
  // this only ever runs against the day it is editing.
  useEffect(() => {
    if (!data) {
      return;
    }
    setBody(data.entry?.body ?? '');
    setMood(data.entry?.mood ? String(data.entry.mood) : NO_MOOD);
  }, [data]);

  const [save, { loading: saving, error: saveError }] = useMutation(SaveEntry, {
    // An entry written today changes the rail and the list under the editor, and
    // on the first save of a day it changes `entry` from null to a row.
    refetchQueries: [JournalDay, RecentEntries],
  });

  const dirty = body !== (entry?.body ?? '') || mood !== (entry?.mood ? String(entry.mood) : NO_MOOD);

  async function submit() {
    await save({
      variables: { date, body, mood: mood === NO_MOOD ? null : Number(mood) },
    }).then(
      () => setSaved(true),
      // `saveError` says it on the field; the rejection has nowhere else to go.
      () => undefined,
    );
  }

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
          {hasFailedToLoad ? (
            // A day that failed to load is not an unwritten one: an editor here would save over it.
            <QueryError error={result.error} onRetry={() => result.refetch()} what="this day's entry" />
          ) : (
            <CardLayout
              title="Entry"
              level={2}
              description="One a day. Saving again edits the same day rather than adding to it."
              loading={result.loading && !data}
              contentSlot={
                <div className="flex flex-col gap-6">
                  <FormField
                    label="How the day went"
                    error={saveError?.message}
                    controlSlot={
                      <Textarea
                        rows={12}
                        value={body}
                        placeholder="What happened, and what you made of it."
                        onChangeText={(next) => {
                          setBody(next);
                          setSaved(false);
                        }}
                      />
                    }
                  />
                  <FormField
                    label="Mood"
                    asGroup
                    description="Optional, and the only part of an entry anything else can read."
                    controlSlot={(props) => (
                      <MoodSpectrum
                        {...props}
                        value={mood}
                        onValueChange={(next) => {
                          setMood(next);
                          setSaved(false);
                        }}
                      />
                    )}
                  />
                </div>
              }
              footerSlot={
                saved && !dirty ? (
                  <span className="text-foreground/60 text-sm" role="status">
                    Saved.
                  </span>
                ) : null
              }
              footerActionsSlot={
                <Button
                  variant="positive"
                  content={entry ? 'Save changes' : 'Save entry'}
                  loading={saving}
                  loadingLabel="Saving…"
                  disabled={!dirty}
                  onClick={submit}
                />
              }
            />
          )}

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
