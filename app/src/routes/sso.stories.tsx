import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { expect, within } from 'storybook/test';
import { getToken } from '@/lib/auth';
import { SsoPage, VerifyOneTimeToken } from './sso.tsx';

const REQUEST = { query: VerifyOneTimeToken, variables: { token: 'a-one-time-token' } };
const FAILED = "That sign-in didn't work.";
const SESSION = { verifyOneTimeToken: { token: 'a-session-token', userId: 'user-1' } };

const meta = {
  component: SsoPage,
  parameters: { route: '/auth/sso?token=a-one-time-token' },
  render: () => (
    <Routes>
      <Route path="/auth/sso" element={<SsoPage />} />
      <Route path="/" element={<p className="p-6">The journal.</p>} />
    </Routes>
  ),
} satisfies Meta<typeof SsoPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignsIn: Story = {
  parameters: { apolloClient: { mocks: [{ request: REQUEST, result: { data: SESSION } }] } },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('The journal.')).toBeVisible();
    await expect(getToken()).toBe('a-session-token');
  },
};

export const StillSigningIn: Story = {
  parameters: {
    apolloClient: { mocks: [{ request: REQUEST, delay: Number.POSITIVE_INFINITY, result: { data: SESSION } }] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { level: 1, name: 'Signing you in…' })).toBeVisible();
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
  },
};

export const TokenAlreadySpent: Story = {
  parameters: {
    apolloClient: { mocks: [{ request: REQUEST, error: new Error('Invalid or expired sign-in. Sign in again.') }] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { level: 1, name: FAILED })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Sign in again' })).toHaveAttribute('href', '/login');
    await expect(getToken()).toBeNull();
  },
};

export const NoTokenOnTheUrl: Story = {
  parameters: { route: '/auth/sso' },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole('heading', { level: 1, name: FAILED })).toBeVisible();
  },
};
