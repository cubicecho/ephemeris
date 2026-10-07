// The session token lives in localStorage rather than a cookie: the API is a
// Bearer-token GraphQL endpoint with no session table, and in development the
// bundle is served by Vite on a different port from the server.
const TOKEN_KEY = 'ephemeris_token';

/**
 * Reads the session token.
 *
 * @returns The token, or null when there is none or the browser blocks storage.
 */
export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

/**
 * Keeps the session token for later visits.
 *
 * @param token - The token the server issued.
 */
export function setToken(token: string): void {
  window.localStorage.setItem(TOKEN_KEY, token);
}

/** Forgets the session token. Signing out, as far as this device is concerned. */
export function clearToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Storage blocked: there is no token to clear.
  }
}
