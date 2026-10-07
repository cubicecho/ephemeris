import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';
import { getToken, setToken } from '@/lib/auth';
import { LoginPage, RequestMagicLink } from './login.tsx';

const EMAIL = 'writer@example.com';
const REQUEST = { query: RequestMagicLink, variables: { email: EMAIL } };

const meta = {
  component: LoginPage,
  parameters: { route: '/login' },
  render: () => (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<p className="p-6">The journal.</p>} />
    </Routes>
  ),
} satisfies Meta<typeof LoginPage>;
export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Types the address and asks for a link.
 *
 * @param canvasElement - The story's root.
 */
async function askForALink(canvasElement: HTMLElement): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole('textbox', { name: /Email/ }), EMAIL);
  await userEvent.click(canvas.getByRole('button', { name: 'Send sign-in link' }));
}

export const LinkByEmail: Story = {
  parameters: {
    apolloClient: {
      mocks: [{ request: REQUEST, result: { data: { requestMagicLink: { ok: true, magicLink: null, token: null } } } }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Sign in to Ephemeris' })).toBeVisible();
    // The theme is a device preference, so it is reachable signed out.
    await expect(canvas.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();

    await askForALink(canvasElement);

    await expect(await canvas.findByText(`We sent a sign-in link to ${EMAIL}.`)).toBeVisible();
    await userEvent.click(canvas.getByRole('button', { name: 'Use a different email' }));
    await expect(canvas.getByRole('textbox', { name: /Email/ })).toBeVisible();
  },
};

export const LinkOnTheScreen: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        {
          request: REQUEST,
          result: {
            data: {
              requestMagicLink: {
                ok: true,
                magicLink: 'http://localhost:3005/auth/verify?token=a-link-token',
                token: null,
              },
            },
          },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await askForALink(canvasElement);

    // Followed on this origin, whatever origin the server built the link for.
    await expect(await canvas.findByRole('link', { name: 'Sign in now' })).toHaveAttribute(
      'href',
      '/auth/verify?token=a-link-token',
    );
  },
};

export const SignedStraightIn: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        {
          request: REQUEST,
          result: { data: { requestMagicLink: { ok: true, magicLink: null, token: 'a-session-token' } } },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await askForALink(canvasElement);

    await expect(await canvas.findByText('The journal.')).toBeVisible();
    await expect(getToken()).toBe('a-session-token');
  },
};

export const Refused: Story = {
  parameters: {
    apolloClient: { mocks: [{ request: REQUEST, error: new Error('Too many attempts. Try again later.') }] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await askForALink(canvasElement);

    await expect(await canvas.findByText('We could not send a link')).toBeVisible();
    await expect(canvas.getByText('Too many attempts. Try again later.')).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: /Email/ })).toHaveValue(EMAIL);
  },
};

export const AlreadySignedIn: Story = {
  beforeEach: () => {
    setToken('a-session-token');
  },
  play: async ({ canvasElement }) => {
    await expect(await within(canvasElement).findByText('The journal.')).toBeVisible();
  },
};
