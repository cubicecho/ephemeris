import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { expect, within } from 'storybook/test';
import { getToken } from '@/lib/auth';
import { VerifyMagicLink, VerifyPage } from './verify.tsx';

const REQUEST = { query: VerifyMagicLink, variables: { token: 'a-link-token' } };
const INVALID = 'This sign-in link is invalid or has expired.';

const meta = {
  component: VerifyPage,
  parameters: { route: '/auth/verify?token=a-link-token' },
  render: () => (
    <Routes>
      <Route path="/auth/verify" element={<VerifyPage />} />
      <Route path="/" element={<p className="p-6">The journal.</p>} />
    </Routes>
  ),
} satisfies Meta<typeof VerifyPage>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignsIn: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        {
          request: REQUEST,
          result: { data: { verifyMagicLink: { token: 'a-session-token', userId: 'user-1' } } },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('The journal.')).toBeVisible();
    await expect(getToken()).toBe('a-session-token');
  },
};

export const StillSigningIn: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        {
          request: REQUEST,
          delay: Number.POSITIVE_INFINITY,
          result: { data: { verifyMagicLink: { token: 'a-session-token', userId: 'user-1' } } },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { level: 1, name: 'Signing you in…' })).toBeVisible();
    await expect(canvas.getAllByRole('status')).toHaveLength(1);
  },
};

export const LinkAlreadyUsed: Story = {
  parameters: {
    apolloClient: { mocks: [{ request: REQUEST, error: new Error('Invalid or expired link') }] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByRole('heading', { level: 1, name: INVALID })).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Request a new one' })).toHaveAttribute('href', '/login');
    await expect(getToken()).toBeNull();
  },
};

export const NoTokenInTheLink: Story = {
  parameters: { route: '/auth/verify' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(canvas.getByRole('heading', { level: 1, name: INVALID })).toBeVisible();
  },
};
