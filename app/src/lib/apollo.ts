import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from '@apollo/client';
import { CombinedGraphQLErrors } from '@apollo/client/errors';
import { ErrorLink } from '@apollo/client/link/error';
import { clearToken, getToken } from './auth.ts';

// Same origin in both modes: the server serves the built bundle in production,
// and Vite proxies /graphql to it in development.
const httpLink = new HttpLink({
  uri: '/graphql',
  fetch: (uri, options) => {
    const headers = new Headers(options?.headers);
    const token = getToken();
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
    return fetch(uri, { ...options, headers });
  },
});

// A session that expired, was ended on another device, or predates better-auth
// fails every request the same way: UNAUTHENTICATED. Drop it and start over at
// sign-in rather than rendering a page of errors. A bad sign-in link is
// BAD_USER_INPUT instead, so it never lands here.
const errorLink = new ErrorLink(({ error }) => {
  const isNetworkFailure = CombinedGraphQLErrors.is(error) === false;
  if (isNetworkFailure) {
    return;
  }
  const isSessionValid = error.errors.some(({ extensions }) => extensions?.code === 'UNAUTHENTICATED') === false;
  if (isSessionValid) {
    return;
  }
  clearToken();
  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
});

export const apolloClient = new ApolloClient({
  link: ApolloLink.from([errorLink, httpLink]),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: { fetchPolicy: 'cache-and-network' },
  },
});
