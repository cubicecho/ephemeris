import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AppLayout } from '@/components/app-shell/app-layout';
import { RecentEntries } from '@/components/entries/recent-days';

const DAYS = [
  { __typename: 'Entry' as const, id: '1', entryDate: '2026-09-15', body: 'Today.', mood: 4 },
  { __typename: 'Entry' as const, id: '2', entryDate: '2026-09-14', body: 'Yesterday.', mood: null },
];

/**
 * The day the fixtures are written against. `AppLayout` reads the clock itself —
 * `todayIso()`, not a prop — so the rail's "Today" link and the row that says
 * "Today" rather than a date both depend on it, and a test that only set the
 * route was a test that passed on the 15th of September 2026 and never again.
 */
const TODAY = '2026-09-15';

beforeAll(() => {
  // Noon local, so the fake instant is the 15th in every timezone.
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date(`${TODAY}T12:00:00`));
});
afterAll(() => vi.useRealTimers());

function renderShell(today = TODAY) {
  return render(
    <MockedProvider mocks={[{ request: { query: RecentEntries }, result: { data: { entries: DAYS } } }]}>
      <MemoryRouter initialEntries={[`/${today}`]}>
        <AppLayout contentSlot={<p>the page</p>} />
      </MemoryRouter>
    </MockedProvider>,
  );
}

// The rail and the mobile bar are the same navigation twice, and a browser shows
// exactly one of them — `hidden` is `display: none`, so the other is not in the
// accessibility tree either. jsdom applies no stylesheet and therefore sees
// both, which is why every query here is scoped to one landmark.
describe('AppLayout', () => {
  // A smoke test, and it earns its keep: the shell is the one component every
  // signed-in screen goes through, and its parts (the rail, the header count,
  // the theme control) each lean on something outside it — the router, Apollo,
  // the device's storage.
  it('draws the chrome around the page', async () => {
    renderShell();
    const rail = screen.getByRole('complementary');

    expect(screen.getByText('the page')).toBeInTheDocument();
    expect(within(rail).getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(within(rail).getByRole('navigation', { name: 'Recent days' })).toBeInTheDocument();
  });

  it('puts today at the top of the rail and counts the days in the header', async () => {
    renderShell();
    const rail = screen.getByRole('complementary');

    expect(within(rail).getByRole('link', { name: 'Today' })).toHaveAttribute('href', `/${TODAY}`);
    // The 15th is today, so the rail says "Today" rather than the date; the
    // 14th is not, so it says the day. The mood rides along as a swatch, whose
    // only text is the word behind it — said once, by the row — and the rail
    // draws no number.
    const days = within(rail).getByRole('navigation', { name: 'Recent days' });
    expect((await within(days).findAllByRole('link')).map((link) => link.textContent)).toEqual([
      'TodayGood',
      'Yesterday',
    ]);
    expect(within(days).getByText('2 of the last 30 days written')).toBeInTheDocument();
    expect(within(screen.getByRole('banner')).getByText(/of the last 30 days written/)).toBeInTheDocument();
  });
});
