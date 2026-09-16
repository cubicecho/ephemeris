import { useMutation, useQuery } from '@apollo/client/react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router';
import { graphql } from '@/__generated__';
import { ActionButton } from '@/components/action-button';
import { CardLayout } from '@/components/card-layout';
import { RECENT_LIMIT, RecentDaysList, RecentEntries } from '@/components/domain/recent-days';
import { FormField } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Section } from '@/components/section';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { formatDay, formatFullDate, isValidIsoDate, shiftDays, todayIso } from '@/lib/date';
import { MOODS, NO_MOOD } from '@/lib/mood';

const JournalDay = graphql(`
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
  if (!isValidIsoDate(date)) return <Navigate to={`/${today}`} replace />;

  return <JournalDayPage key={date} date={date} today={today} />;
}

function JournalDayPage({ date, today }: { date: string; today: string }) {
  const result = useQuery(JournalDay, { variables: { date } });
  const { data } = result;
  const entry = data?.entry ?? null;

  const [body, setBody] = useState('');
  const [mood, setMood] = useState<string>(NO_MOOD);
  const [saved, setSaved] = useState(false);

  // The server's copy is the starting point, not the running value: re-seeding
  // the boxes on every result would overwrite what is being typed each time the
  // cache-and-network refetch lands. `key={date}` remounts on a day change, so
  // this only ever runs against the day it is editing.
  useEffect(() => {
    if (!data) return;
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
    }).then(() => setSaved(true));
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <PageHeader
        // The chassis around this one is `AppLayout`'s padded `<main>`, so the
        // header gives up its own inset rather than adding a second one.
        className="px-0 py-0"
        titleClassName="text-2xl"
        title={formatDay(date)}
        description={date === today ? formatFullDate(date) : `${formatFullDate(date)} · not today`}
        content={
          <div className="flex items-center gap-2">
            <ActionButton label="Previous day" variant="outline" size="icon-sm" asChild>
              <Link to={`/${shiftDays(date, -1)}`}>
                <ChevronLeft className="size-4" aria-hidden />
              </Link>
            </ActionButton>
            <ActionButton
              label="Next day"
              variant="outline"
              size="icon-sm"
              asChild
              // A journal has nothing to say about tomorrow.
              disabled={date >= today}
              hint={date >= today ? 'Tomorrow has not happened yet' : undefined}
            >
              <Link to={`/${shiftDays(date, 1)}`}>
                <ChevronRight className="size-4" aria-hidden />
              </Link>
            </ActionButton>
            {date !== today && (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/${today}`}>Back to today</Link>
              </Button>
            )}
          </div>
        }
      />

      <CardLayout
        title="Entry"
        description="One a day. Saving again edits the same day rather than adding to it."
        loading={result.loading && !data}
        content={
          <div className="flex flex-col gap-6">
            <FormField
              label="How the day went"
              error={saveError?.message}
              control={
                <Textarea
                  rows={12}
                  value={body}
                  placeholder="What happened, and what you made of it."
                  onChange={(event) => {
                    setBody(event.target.value);
                    setSaved(false);
                  }}
                />
              }
            />
            <FormField
              label="Mood"
              asGroup
              description="Optional, and the only part of an entry anything else can read."
              control={
                <RadioGroup
                  className="flex flex-wrap gap-x-5 gap-y-2"
                  value={mood}
                  onValueChange={(next) => {
                    setMood(next);
                    setSaved(false);
                  }}
                >
                  {MOODS.map((option) => (
                    <div key={option.value} className="flex items-center gap-2">
                      <RadioGroupItem id={`mood-${option.value}`} value={String(option.value)} />
                      <Label htmlFor={`mood-${option.value}`} className="font-normal">
                        {option.value} · {option.label}
                      </Label>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="mood-none" value={NO_MOOD} />
                    <Label htmlFor="mood-none" className="font-normal text-muted-foreground">
                      Not recorded
                    </Label>
                  </div>
                </RadioGroup>
              }
            />
          </div>
        }
        footer={
          saved && !dirty ? (
            <span className="text-muted-foreground text-sm" role="status">
              Saved.
            </span>
          ) : null
        }
        footerActions={
          <Button onClick={submit} disabled={saving || !dirty}>
            {saving ? 'Saving…' : entry ? 'Save changes' : 'Save entry'}
          </Button>
        }
      />

      {/* The rail already lists these; this is the same list for the widths that
          have no rail. */}
      <Section
        className="md:hidden"
        title="Recent"
        description={`The last ${RECENT_LIMIT} days you wrote about.`}
        content={<RecentDaysList />}
      />
    </div>
  );
}
