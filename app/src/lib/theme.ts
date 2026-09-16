/**
 * Which palette to paint. Stored per device rather than on the account: it
 * describes the screen you are looking at, not who you are, and the same person
 * may well want dark on a laptop at night and light on a desk monitor. It is
 * also why this never touches the API — a signed-out login page has a theme too.
 *
 * `index.css` declares `@custom-variant dark (&:is(.dark *))`, so applying a
 * theme means putting `.dark` on <html> and letting the CSS variables do the
 * rest. `index.html` runs the same rule in a blocking script before first paint,
 * so a dark-theme reader never gets a white flash on load; THEME_KEY is
 * duplicated there and the two must agree.
 */
export type ThemePreference = 'system' | 'light' | 'dark';

const THEME_KEY = 'ephemeris_theme';

function isPreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Reads can throw, not just return null: `localStorage` is a SecurityError in a
 * private window with site data blocked, and a theme is never worth a blank page.
 */
export function getThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

/** What `system` currently means, or the preference itself when it is explicit. */
export function resolveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function paint(preference: ThemePreference): void {
  document.documentElement.classList.toggle('dark', resolveTheme(preference) === 'dark');
}

export function setThemePreference(preference: ThemePreference): void {
  // Paint first. Persisting is the part that can fail, and a click that changes
  // nothing on screen is worse than one that forgets by tomorrow.
  paint(preference);
  try {
    window.localStorage.setItem(THEME_KEY, preference);
  } catch {
    // Storage unavailable — the choice holds for this page and no longer.
  }
}

/**
 * Apply the stored preference and keep it honest. Returns an unsubscribe, so
 * the caller is an effect: while the preference is `system`, changing the OS
 * theme repaints the app without a reload.
 */
export function syncTheme(): () => void {
  paint(getThemePreference());
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const onChange = () => {
    if (getThemePreference() === 'system') paint('system');
  };
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}
