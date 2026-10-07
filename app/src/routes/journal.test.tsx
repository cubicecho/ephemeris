import { gql } from '@apollo/client';
import type { MockLink } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RECENT_LIMIT, RecentEntries } from '@/components/entries/recent-days';
import { JournalDay, JournalRoute } from '@/routes/journal';

const DATE = '2026-09-15';
// The route does not export its mutation, so the test names the operation it expects on the wire.
const SAVE_ENTRY = gql`
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
`;
const RECENT = {
  request: { query: RecentEntries, variables: { limit: RECENT_LIMIT } },
  result: { data: { entries: [] } },
};

/**
 * Draws the journal route on `DATE` against a mocked server.
 *
 * @param dayMock - What the server answers the day's query with.
 * @param moreMocks - Answers to whatever the test goes on to ask.
 */
function renderDay(dayMock: { result: object } | { error: Error }, moreMocks: MockLink.MockedResponse[] = []): void {
  const day = { request: { query: JournalDay, variables: { date: DATE } }, ...dayMock };
  render(
    <MockedProvider mocks={[day, RECENT, ...moreMocks]}>
      <MemoryRouter initialEntries={[`/${DATE}`]}>
        <Routes>
          <Route path="/:date" element={<JournalRoute />} />
        </Routes>
      </MemoryRouter>
    </MockedProvider>,
  );
}

describe('JournalRoute', () => {
  it('offers an empty editor for a day nothing was written on', async () => {
    renderDay({ result: { data: { entry: null } } });

    expect(await screen.findByRole('button', { name: 'Save entry' })).toBeInTheDocument();
  });

  it('says the day failed to load instead of drawing it as unwritten', async () => {
    renderDay({ error: new Error('Failed to fetch') });

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("this day's entry");
    // An editor here would let a save overwrite a day that only failed to load.
    expect(screen.queryByRole('button', { name: 'Save entry' })).not.toBeInTheDocument();
  });

  it('keeps Save off until something is written, then saves it and says so', async () => {
    const saved = { __typename: 'Entry', id: '1', entryDate: DATE, body: 'A day.', mood: null };
    renderDay({ result: { data: { entry: null } } }, [
      {
        request: { query: SAVE_ENTRY, variables: { date: DATE, body: 'A day.', mood: null } },
        result: { data: { upsertEntry: saved } },
      },
      { request: { query: JournalDay, variables: { date: DATE } }, result: { data: { entry: saved } } },
      RECENT,
    ]);
    const body = await screen.findByRole('textbox', { name: 'How the day went' });
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeDisabled();

    fireEvent.change(body, { target: { value: 'A day.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'How the day went' })).toHaveValue('A day.');
  });

  it('says a save failed and keeps what was written', async () => {
    renderDay({ result: { data: { entry: null } } }, [
      {
        request: { query: SAVE_ENTRY, variables: { date: DATE, body: 'A day.', mood: null } },
        error: new Error('Failed to fetch'),
      },
    ]);
    const body = await screen.findByRole('textbox', { name: 'How the day went' });

    fireEvent.change(body, { target: { value: 'A day.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));

    expect(await screen.findByText('Failed to fetch')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'How the day went' })).toHaveValue('A day.');
    expect(screen.getByRole('button', { name: 'Save entry' })).toBeEnabled();
  });
});
