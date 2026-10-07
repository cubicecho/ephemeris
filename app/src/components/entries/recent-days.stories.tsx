import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, within } from 'storybook/test';
import { todayIso } from '@/lib/date';
import { DESKTOP, journalServer, recentDaysFailure, SOME_DAYS } from '@/testing/story-mocks';
import { RecentDaysList, RecentDaysSection } from './recent-days.tsx';

const meta = {
  component: RecentDaysList,
  render: () => (
    <div className="max-w-md p-4">
      <RecentDaysList />
    </div>
  ),
} satisfies Meta<typeof RecentDaysList>;
export default meta;
type Story = StoryObj<typeof meta>;

export const DaysAsCards: Story = {
  parameters: { apolloClient: { resolvers: journalServer(SOME_DAYS) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const cards = await canvas.findAllByRole('link');

    await expect(cards).toHaveLength(SOME_DAYS.length);
    // Every day is a URL: a card is one plain link to its day.
    await expect(cards[0]).toHaveAttribute('href', `/${SOME_DAYS[0].entryDate}`);
    await expect(within(cards[0]).getByText('Good')).toBeVisible();
    await expect(within(cards[0]).getByText('Walked to the harbour before work.')).toBeVisible();
    await expect(within(cards[1]).getByText('No words that day.')).toBeVisible();
  },
};

export const NothingWritten: Story = {
  parameters: { apolloClient: { resolvers: journalServer([]) } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('Nothing written yet')).toBeVisible();
    await expect(canvas.queryByRole('link')).not.toBeInTheDocument();
  },
};

export const FailedToLoad: Story = {
  parameters: { apolloClient: { mocks: [recentDaysFailure()] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // A list that failed to load is not an empty one.
    await expect(await canvas.findByRole('alert')).toBeVisible();
    await expect(canvas.queryByText('Nothing written yet')).not.toBeInTheDocument();
  },
};

export const DaysInTheSidebar: Story = {
  globals: DESKTOP,
  parameters: { apolloClient: { resolvers: journalServer(SOME_DAYS) } },
  render: () => (
    <div className="w-64 p-2">
      <RecentDaysSection today={todayIso()} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const days = within(within(canvasElement).getByRole('navigation', { name: 'Recent days' }));
    const links = await days.findAllByRole('link');

    await expect(links.map((link) => link.textContent)).toEqual([
      'TodayGood',
      'Yesterday',
      expect.stringMatching(/Low$/),
    ]);
    await expect(days.getByText('3 of the last 30 days written')).toBeInTheDocument();
  },
};
