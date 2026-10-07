import { ApolloClient, ApolloLink, InMemoryCache } from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import type { MockLink } from '@apollo/client/testing';
import { MockedProvider } from '@apollo/client/testing/react';
import type { Decorator, Preview } from '@storybook/react-vite';
import { print } from 'graphql';
import { GraphQLHandler, type types } from 'graphql-mocks';
import { useMemo } from 'react';
import { MemoryRouter } from 'react-router';
import { from } from 'rxjs';
import schema from '../src/__generated__/schema.graphql?raw';
import type { SlotNode } from '../src/lib/utils.ts';
import '../src/index.css';

/** How a story mocks the server. One mode or the other, or neither for a story that asks it nothing. */
interface ApolloParameters {
  /**
   * Exact requests paired with exact answers, for a story whose subject is the request. A request it was not told
   * about fails the story.
   */
  mocks?: readonly MockLink.MockedResponse[];
  /**
   * Resolvers run against the app's copy of the server's schema, for a story whose subject is the page. A function,
   * so each story starts from its own rows.
   */
  resolvers?: () => types.ResolverMap;
}

/** What a story may set under `parameters`, beyond Storybook's own. */
interface StoryParameters {
  apolloClient?: ApolloParameters;
  /** The URL the story opens on. */
  route?: string;
}

const DEFAULT_ROUTE = '/';

/**
 * The two widths the app is drawn at: under `md` the sidebar gives way to a bar. A story picks one with
 * `globals: { viewport: { value: 'desktop' } }`, and the test run sizes the browser to match.
 */
const VIEWPORTS = {
  phone: { name: 'Phone', styles: { width: '390px', height: '844px' } },
  desktop: { name: 'Desktop', styles: { width: '1280px', height: '800px' } },
};

/**
 * Builds a client whose every operation is executed against the server's schema by the story's resolvers.
 *
 * @param resolvers - The story's resolvers.
 * @returns A client with an empty cache.
 */
function createResolverClient(resolvers: types.ResolverMap): ApolloClient {
  const handler = new GraphQLHandler({ resolverMap: resolvers, dependencies: { graphqlSchema: schema } });
  const link = new ApolloLink((operation) => from(handler.query(print(operation.query), operation.variables)));
  return new ApolloClient({ cache: new InMemoryCache(), link });
}

/** Apollo over a mocked schema. The client is built once per mount, and a story mounts it under its own key. */
function ResolverProvider({ resolvers, contentSlot }: { resolvers: () => types.ResolverMap; contentSlot: SlotNode }) {
  const client = useMemo(() => createResolverClient(resolvers()), [resolvers]);
  return <ApolloProvider client={client}>{contentSlot}</ApolloProvider>;
}

/**
 * The app's providers around every story, including one that asks the server nothing: a mocked Apollo client and a
 * router. Keyed by the story's id, so each story gets a client with an empty cache.
 */
const withProviders: Decorator = (Story, context) => {
  const { apolloClient = {}, route = DEFAULT_ROUTE }: StoryParameters = context.parameters;
  const page = (
    <MemoryRouter initialEntries={[route]}>
      <Story />
    </MemoryRouter>
  );
  if (apolloClient.resolvers) {
    return <ResolverProvider key={context.id} resolvers={apolloClient.resolvers} contentSlot={page} />;
  }
  return (
    <MockedProvider key={context.id} mocks={apolloClient.mocks ?? []}>
      {page}
    </MockedProvider>
  );
};

const preview: Preview = {
  decorators: [withProviders],
  parameters: {
    // An unlabelled control or text under 4.5:1 fails the story, the way a crash does.
    a11y: { test: 'error' },
    layout: 'fullscreen',
    viewport: { options: VIEWPORTS },
  },
  initialGlobals: { viewport: { value: 'phone', isRotated: false } },
  // The token and the theme live in localStorage, and a story must not inherit the last one's.
  beforeEach: () => {
    window.localStorage.clear();
  },
};

export default preview;
