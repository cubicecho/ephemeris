import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RECENT_LIMIT, RecentEntries } from '@/components/entries/recent-days';
import { JournalDay, JournalRoute } from '@/routes/journal';

const DATE = '2026-09-15';
const RECENT = {
  request: { query: RecentEntries, variables: { limit: RECENT_LIMIT } },
  result: { data: { entries: [] } },
};

/**
 * Draws the journal route on `DATE` against a mocked server.
 *
 * @param dayMock - What the server answers the day's query with.
 */
function renderDay(dayMock: { result: object } | { error: Error }): void {
  render(
    <MockedProvider mocks={[{ request: { query: JournalDay, variables: { date: DATE } }, ...dayMock }, RECENT]}>
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
});
