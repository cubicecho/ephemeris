import type { MockLink } from '@apollo/client/testing';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Route, Routes } from 'react-router';
import { expect, userEvent, within } from 'storybook/test';
import type { SsoSource } from '@/__generated__/graphql';
import { PairSso } from '@/components/sso/pair-sso-form';
import { SignInOptions } from '@/components/sso/sign-in-options';
import { getToken, setToken } from '@/lib/auth';
import { LoginPage, SignInMagicLink } from './login.tsx';

const EMAIL = 'writer@example.com';
const REQUEST = { query: SignInMagicLink, variables: { email: EMAIL } };
const PROVIDER = { name: 'heautou', signInUrl: 'http://localhost:3005/sso/oidc' };
const SETUP_URL = 'https://id.example.com/oidc#setup=a-setup-token&name=heautou';

/** What the server says about signing in, as far as one story cares. */
interface Options {
  secureLocalNet?: boolean;
  sso?: typeof PROVIDER | null;
  canPair?: boolean;
  source?: SsoSource;
}

/**
 * The server's answer to the sign-in options the page asks for first.
 *
 * @param [options] - What differs from an instance that sends links, has no provider, and may not be paired.
 * @returns A mock that answers once.
 */
function optionsMock({
  secureLocalNet = false,
  sso = null,
  canPair = false,
  source = 'NONE',
}: Options = {}): MockLink.MockedResponse {
  return {
    request: { query: SignInOptions },
    result: { data: { authConfig: { secureLocalNet, sso }, ssoSetup: { source, canPair } } },
  };
}

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
 * @param [button] - What the submit says.
 */
async function askForALink(canvasElement: HTMLElement, button = 'Send sign-in link'): Promise<void> {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole('textbox', { name: /Email/ }), EMAIL);
  await userEvent.click(await canvas.findByRole('button', { name: button }));
}

export const LinkByEmail: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        optionsMock(),
        { request: REQUEST, result: { data: { signInMagicLink: { status: true, magicLink: null, token: null } } } },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('heading', { level: 1, name: 'Sign in to Ephemeris' })).toBeVisible();
    // The theme is a device preference, so it is reachable signed out.
    await expect(canvas.getByRole('radiogroup', { name: 'Theme' })).toBeVisible();

    await askForALink(canvasElement);

    await expect(await canvas.findByText(`We sent a sign-in link to ${EMAIL}.`)).toBeVisible();
    // No provider and nothing to pair: neither is offered.
    await expect(canvas.queryByRole('link', { name: /Sign in with/ })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole('button', { name: 'Use a different email' }));
    await expect(canvas.getByRole('textbox', { name: /Email/ })).toBeVisible();
  },
};

export const LinkOnTheScreen: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        optionsMock(),
        {
          request: REQUEST,
          result: {
            data: {
              signInMagicLink: {
                status: true,
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
        optionsMock({ secureLocalNet: true }),
        {
          request: REQUEST,
          result: { data: { signInMagicLink: { status: true, magicLink: null, token: 'a-session-token' } } },
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText('A journal of one. Enter your email to sign in.')).toBeVisible();

    // An address alone signs in, so the button says so rather than promising a link.
    await askForALink(canvasElement, 'Sign in');

    await expect(await canvas.findByText('The journal.')).toBeVisible();
    await expect(getToken()).toBe('a-session-token');
  },
};

export const Refused: Story = {
  parameters: {
    apolloClient: {
      mocks: [optionsMock(), { request: REQUEST, error: new Error('Too many attempts. Try again later.') }],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await askForALink(canvasElement);

    await expect(await canvas.findByText('We could not send a link')).toBeVisible();
    await expect(canvas.getByText('Too many attempts. Try again later.')).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: /Email/ })).toHaveValue(EMAIL);
  },
};

export const WithAProvider: Story = {
  parameters: { apolloClient: { mocks: [optionsMock({ sso: PROVIDER })] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // A plain link to the server, which sends the browser on to the provider.
    await expect(await canvas.findByRole('link', { name: 'Sign in with heautou' })).toHaveAttribute(
      'href',
      PROVIDER.signInUrl,
    );
    await expect(canvas.getByText('or sign in by email')).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: /Email/ })).toBeVisible();
  },
};

export const ProviderSignInFailed: Story = {
  parameters: { route: '/login?error=state_mismatch', apolloClient: { mocks: [optionsMock({ sso: PROVIDER })] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText("Signing in with heautou didn't work")).toBeVisible();
    await expect(canvas.getByText(/state_mismatch/)).toBeVisible();
    await expect(canvas.getByRole('link', { name: 'Sign in with heautou' })).toBeVisible();
  },
};

export const ProviderGone: Story = {
  parameters: { route: '/login?error=sso_off', apolloClient: { mocks: [optionsMock()] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(await canvas.findByText('That sign-in button is gone')).toBeVisible();
    await expect(canvas.queryByRole('link', { name: /Sign in with/ })).not.toBeInTheDocument();
  },
};

export const PairsAProvider: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        optionsMock({ canPair: true }),
        {
          request: { query: PairSso, variables: { setupUrl: SETUP_URL } },
          result: { data: { pairSso: { source: 'PAIRED', name: 'heautou', canPair: true } } },
        },
        // Asked again once paired, which is what puts the button on the page.
        optionsMock({ sso: PROVIDER, canPair: true, source: 'PAIRED' }),
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // A new instance: anyone may set sign-in up, because there is no admin yet to ask.
    await userEvent.click(await canvas.findByRole('button', { name: 'Set up sign-in with a provider' }));
    await userEvent.type(canvas.getByRole('textbox', { name: /Setup URL/ }), SETUP_URL);
    await userEvent.click(canvas.getByRole('button', { name: 'Connect' }));

    await expect(await canvas.findByText('Paired with heautou')).toBeVisible();
    await expect(await canvas.findByRole('link', { name: 'Sign in with heautou' })).toBeVisible();
    // Paired, so there is nothing left to set up from here.
    await expect(canvas.queryByRole('button', { name: 'Set up sign-in with a provider' })).not.toBeInTheDocument();
  },
};

export const PairingRefused: Story = {
  parameters: {
    apolloClient: {
      mocks: [
        optionsMock({ canPair: true }),
        {
          request: { query: PairSso, variables: { setupUrl: SETUP_URL } },
          error: new Error('This setup URL has expired, was used already, or was cancelled.'),
        },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(await canvas.findByRole('button', { name: 'Set up sign-in with a provider' }));
    await userEvent.type(canvas.getByRole('textbox', { name: /Setup URL/ }), SETUP_URL);
    await userEvent.click(canvas.getByRole('button', { name: 'Connect' }));

    await expect(await canvas.findByText('Could not pair')).toBeVisible();
    await expect(canvas.getByText(/has expired/)).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: /Setup URL/ })).toHaveValue(SETUP_URL);
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
