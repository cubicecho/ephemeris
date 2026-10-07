import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';
import { getToken, setToken } from '@/lib/auth';
import { todayIso } from '@/lib/date';
import { DESKTOP, recentDaysMock, SOME_DAYS } from '@/testing/story-mocks';
import { AppLayout } from './app-layout.tsx';

const meta = {
  component: AppLayout,
  args: { contentSlot: <p className="p-6">The page.</p> },
  parameters: { apolloClient: { mocks: [recentDaysMock(SOME_DAYS)] }, route: `/${todayIso()}` },
} satisfies Meta<typeof AppLayout>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithASidebar: Story = {
  globals: DESKTOP,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const sidebar = within(canvas.getByRole('complementary'));

    await expect(canvas.getByText('The page.')).toBeVisible();
    await expect(sidebar.getByRole('link', { name: 'Today' })).toHaveAttribute('href', `/${todayIso()}`);
    await expect(sidebar.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();
    await expect(sidebar.getByRole('button', { name: 'Sign out' })).toBeVisible();
    const days = within(sidebar.getByRole('navigation', { name: 'Recent days' }));
    await expect(await days.findAllByRole('link')).toHaveLength(SOME_DAYS.length);
  },
};

export const OnAPhone: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = within(canvas.getByRole('banner'));

    // No room for a sidebar: the bar carries the same navigation and the count of days.
    await expect(canvas.queryByRole('complementary')).not.toBeInTheDocument();
    await expect(bar.getByRole('link', { name: 'Today' })).toBeVisible();
    await expect(await bar.findByText('3 of the last 30 days written')).toBeVisible();
    await expect(canvas.getByText('The page.')).toBeVisible();
  },
};

export const SigningOut: Story = {
  globals: DESKTOP,
  beforeEach: () => {
    setToken('a-session-token');
  },
  render: (args) => (
    <Routes>
      <Route path="/login" element={<p className="p-6">The sign-in screen.</p>} />
      <Route path="*" element={<AppLayout {...args} />} />
    </Routes>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await within(canvas.getByRole('complementary')).findAllByRole('link');

    await userEvent.click(within(canvas.getByRole('complementary')).getByRole('button', { name: 'Sign out' }));

    await expect(await canvas.findByText('The sign-in screen.')).toBeVisible();
    await expect(getToken()).toBeNull();
  },
};
