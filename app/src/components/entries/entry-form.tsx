import { useMutation } from '@apollo/client/react';
import { useState } from 'react';
import { graphql } from '@/__generated__';
import { TextareaField, useAppForm } from '@/components/app-form';
import { CardLayout } from '@/components/card-layout';
import { RecentEntries } from '@/components/entries/recent-days';
import { MoodField } from '@/components/mood/mood-field';
import { Alert } from '@/components/ui/alert';
import { NO_MOOD } from '@/lib/mood';

const FORM_ID = 'entry';
const BODY_ROWS = 12;

/** The day's entry, or null for a day nothing was written on. */
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

// One mutation for both halves of "save what I have for today". The conflict target is the (userId, entryDate) unique
// constraint: `userId` never leaves the server, so the client names the column without ever supplying a value. `update`
// lists only the two columns a writer owns, so a re-save cannot touch `id` or `createdAt`.
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

/** What the editor holds: the words, and the mood as a radio value. */
interface EntryValues {
  body: string;
  mood: string;
}

interface EntryFormProps {
  /** The day being written, as an ISO date. */
  date: string;
  /** What the server holds for that day. `null` is a day nothing was written on. */
  entry: { body: string; mood?: number | null } | null;
}

/**
 * The server's copy of a day in the editor's terms.
 *
 * @param entry - The day's row, or null for a day nothing was written on.
 * @returns Empty words and no mood for an unwritten day.
 */
function toValues(entry: EntryFormProps['entry']): EntryValues {
  return { body: entry?.body ?? '', mood: entry?.mood ? String(entry.mood) : NO_MOOD };
}

/**
 * The editor for one day: the words, the mood, and a Save that says it is saving.
 *
 * The server's copy is the form's default, not its running value. An untouched form follows a refetch; a touched one
 * keeps what is being typed. The caller mounts this once the day has loaded and keys it by date, so it only ever holds
 * the day it is editing.
 *
 * Unsaved is asked of the server's copy directly rather than of the form's `isDefaultValue`: TanStack takes a new
 * default on a touched form without recomputing that flag, so after a save it would go on saying there is work to keep.
 */
export function EntryForm({ date, entry }: EntryFormProps) {
  const [hasSaved, setHasSaved] = useState(false);
  const [save, { error: saveError }] = useMutation(SaveEntry, {
    // An entry written today changes the sidebar and the list under the editor, and on the first save of a day it
    // changes `entry` from null to a row.
    refetchQueries: [JournalDay, RecentEntries],
  });

  const stored = toValues(entry);
  const isStored = (values: EntryValues) => values.body === stored.body && values.mood === stored.mood;

  const form = useAppForm({
    defaultValues: stored,
    onSubmit: async ({ value }) => {
      const mood = value.mood === NO_MOOD ? null : Number(value.mood);
      // A failed save is said by `saveError` below; the rejection has nowhere else to go.
      const result = await save({ variables: { date, body: value.body, mood } }).catch(() => null);
      setHasSaved(result !== null);
    },
  });

  return (
    <CardLayout
      title="Entry"
      level={2}
      description="One a day. Saving again edits the same day rather than adding to it."
      contentSlot={
        <form
          id={FORM_ID}
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            form.handleSubmit();
          }}
        >
          {saveError && (
            <Alert variant="destructive" title="This entry was not saved" description={saveError.message} />
          )}
          <TextareaField
            form={form}
            name="body"
            label="How the day went"
            rows={BODY_ROWS}
            placeholder="What happened, and what you made of it."
          />
          <MoodField
            form={form}
            name="mood"
            label="Mood"
            description="Optional, and the only part of an entry anything else can read."
          />
        </form>
      }
      footerSlot={
        <form.Subscribe selector={(state) => isStored(state.values)}>
          {(isUnchanged) =>
            hasSaved && isUnchanged ? (
              <span className="text-foreground/60 text-sm" role="status">
                Saved.
              </span>
            ) : null
          }
        </form.Subscribe>
      }
      footerActionsSlot={
        <form.AppForm>
          <form.Subscribe selector={(state) => isStored(state.values)}>
            {(isUnchanged) => (
              <form.SubmitButton
                form={FORM_ID}
                variant="positive"
                content={entry ? 'Save changes' : 'Save entry'}
                disabled={isUnchanged}
              />
            )}
          </form.Subscribe>
        </form.AppForm>
      }
    />
  );
}
