import { MockedProvider } from '@apollo/client/testing/react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RecentEntries } from '@/components/domain/recent-days';
import { AppLayout } from '@/components/layouts/app-layout';
import { TooltipProvider } from '@/components/ui/tooltip';

const DAYS = [
  { __typename: 'Entry' as const, id: '1', entryDate: '2026-09-15', body: 'Today.', mood: 4 },
  { __typename: 'Entry' as const, id: '2', entryDate: '2026-09-14', body: 'Yesterday.', mood: null },
];

function renderShell(today = '2026-09-15') {
  return render(
    <MockedProvider mocks={[{ request: { query: RecentEntries }, result: { data: { entries: DAYS } } }]}>
      <MemoryRouter initialEntries={[`/${today}`]}>
        {/* Both of these are `main.tsx`'s job in the real tree; the shell asks
            for them and does not provide them. */}
        <TooltipProvider>
          <AppLayout>
            <p>the page</p>
          </AppLayout>
        </TooltipProvider>
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
  // signed-in screen goes through, and three of its parts (the rail, the header
  // count, the theme control) each need a provider it does not own itself.
  it('draws the chrome around the page', async () => {
    renderShell();
    const rail = screen.getByRole('complementary');

    expect(screen.getByText('the page')).toBeInTheDocument();
    expect(within(rail).getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
    expect(within(rail).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(await within(rail).findByRole('navigation', { name: 'Recent days' })).toBeInTheDocument();
  });

  it('puts today at the top of the rail and counts the days in the header', async () => {
    renderShell();
    const rail = screen.getByRole('complementary');

    expect(within(rail).getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/2026-09-15');
    // The 15th is today, so the rail says "Today" rather than the date; the
    // 14th is not, so it says the day.
    const days = await within(rail).findByRole('navigation', { name: 'Recent days' });
    expect(
      within(days)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual(['Today4', 'Yesterday']);
    expect(within(screen.getByRole('banner')).getByText(/of the last 30 days written/)).toBeInTheDocument();
  });
});
