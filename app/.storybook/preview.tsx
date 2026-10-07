import type { MockLink } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router';
import '../src/index.css';

/** What a story may set under `parameters`, beyond Storybook's own. */
interface StoryParameters {
  /** The requests the story expects and what the server answers. A request it was not told about fails the story. */
  apolloClient?: { mocks?: readonly MockLink.MockedResponse[] };
  /** The URL the story opens on. */
  route?: string;
}

const DEFAULT_ROUTE = '/';

/**
 * The app's providers around every story, including one that asks the server nothing: a mocked Apollo client and a
 * router. Keyed by the story's id, so each story gets a client with an empty cache.
 */
const withProviders: Decorator = (Story, context) => {
  const { apolloClient, route = DEFAULT_ROUTE }: StoryParameters = context.parameters;
  return (
    <MockedProvider key={context.id} mocks={apolloClient?.mocks ?? []}>
      <MemoryRouter initialEntries={[route]}>
        <Story />
      </MemoryRouter>
    </MockedProvider>
  );
};

const preview: Preview = {
  decorators: [withProviders],
  parameters: {
    // An unlabelled control or text under 4.5:1 fails the story, the way a crash does.
    a11y: { test: 'error' },
    layout: 'fullscreen',
  },
  // The token and the theme live in localStorage, and a story must not inherit the last one's.
  beforeEach: () => {
    window.localStorage.clear();
  },
};

export default preview;
