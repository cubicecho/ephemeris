import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';
import { JournalDay } from '@/components/entries/entry-form';
import { shiftDays, todayIso } from '@/lib/date';
import { entryRow, journalServer, recentDaysMock } from '@/testing/story-mocks';
import { JournalRoute } from './journal.tsx';

const TODAY = todayIso();
const LAST_WEEK = entryRow(6, 'Rain all day. Stayed in and read.', 2);

const meta = {
  component: JournalRoute,
  render: () => (
    <Routes>
      <Route path="/:date" element={<JournalRoute />} />
    </Routes>
  ),
} satisfies Meta<typeof JournalRoute>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WritingToday: Story = {
  parameters: {
    route: `/${TODAY}`,
    apolloClient: { resolvers: journalServer([]) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
    // A journal has nothing to say about tomorrow.
    await expect(canvas.getByRole('button', { name: 'Next day' })).toHaveAttribute('aria-disabled', 'true');
    await expect(canvas.getByRole('link', { name: 'Previous day' })).toHaveAttribute(
      'href',
      `/${shiftDays(TODAY, -1)}`,
    );

    await userEvent.type(await canvas.findByRole('textbox', { name: 'How the day went' }), 'A quiet one.');
    await userEvent.click(canvas.getByRole('radio', { name: 'Good' }));
    await userEvent.click(canvas.getByRole('button', { name: 'Save entry' }));

    await expect(await canvas.findByText('Saved.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    // The day just written joins the recent ones without a reload.
    await expect(await canvas.findByRole('link', { name: /A quiet one\./ })).toBeVisible();
  },
};

export const AnEarlierDay: Story = {
  parameters: {
    route: `/${LAST_WEEK.entryDate}`,
    apolloClient: { resolvers: journalServer([LAST_WEEK]) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('textbox', { name: 'How the day went' })).toHaveValue(LAST_WEEK.body);
    await expect(canvas.getByRole('radio', { name: 'Low' })).toBeChecked();
    await expect(canvas.getByText(/not today$/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Back to today' })).toHaveAttribute('href', `/${TODAY}`);
    await expect(canvas.getByRole('link', { name: 'Next day' })).toHaveAttribute(
      'href',
      `/${shiftDays(LAST_WEEK.entryDate, 1)}`,
    );
  },
};

export const DayFailsToLoad: Story = {
  parameters: {
    route: `/${TODAY}`,
    apolloClient: {
      mocks: [
        { request: { query: JournalDay, variables: { date: TODAY } }, error: new Error('Failed to fetch') },
        recentDaysMock([]),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('alert')).toBeVisible();
    // An editor here would save over a day that only failed to load.
    await expect(canvas.queryByRole('textbox')).not.toBeInTheDocument();
  },
};

export const NotADay: Story = {
  parameters: {
    route: '/2026-02-31',
    apolloClient: { resolvers: journalServer([]) },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // A date that is not one lands on today rather than on an error.
    await expect(await canvas.findByRole('heading', { level: 1, name: 'Today' })).toBeVisible();
  },
};
