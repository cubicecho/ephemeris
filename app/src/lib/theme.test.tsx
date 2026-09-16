// `.tsx` rather than `.test.ts` on purpose: `vitest.config.ts` routes
// `app/src/lib/**/*.test.ts` to the `node` project, which has no `window`.
// The jsdom project is `app/**/*.test.tsx`, and every line below needs a DOM.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getThemePreference, resolveTheme, setThemePreference, syncTheme } from '@/lib/theme';

const THEME_KEY = 'ephemeris_theme';

/**
 * A `matchMedia` whose answer the test owns, and whose listeners it can fire.
 * jsdom's own always reports `matches: false` and never changes, so `system`
 * would be untestable in both of its two meanings.
 */
function stubMatchMedia(dark: boolean) {
  const listeners = new Set<() => void>();
  const query = {
    matches: dark,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, fn: () => void) => void listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => void listeners.delete(fn),
  };
  vi.spyOn(window, 'matchMedia').mockReturnValue(query as unknown as MediaQueryList);
  return {
    /** The OS theme changed under a running app. */
    set(next: boolean) {
      query.matches = next;
      for (const fn of listeners) fn();
    },
    get listenerCount() {
      return listeners.size;
    },
  };
}

const isDark = () => document.documentElement.classList.contains('dark');

// `vitest.setup.ts` empties storage and restores spies after each test; the
// class on <html> is this suite's own leftover.
beforeEach(() => {
  document.documentElement.classList.remove('dark');
});

describe('getThemePreference', () => {
  it('defaults to system when nothing is stored', () => {
    expect(getThemePreference()).toBe('system');
  });

  it('reads a stored preference', () => {
    window.localStorage.setItem(THEME_KEY, 'dark');
    expect(getThemePreference()).toBe('dark');
  });

  it.each(['', 'DARK', 'solarized', 'null'])('ignores %o and falls back to system', (stored) => {
    window.localStorage.setItem(THEME_KEY, stored);
    expect(getThemePreference()).toBe('system');
  });

  it('falls back to system when storage throws', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(getThemePreference()).toBe('system');
  });
});

describe('resolveTheme', () => {
  it('takes an explicit preference at its word, whatever the OS says', () => {
    stubMatchMedia(true);
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('asks the OS for system', () => {
    const os = stubMatchMedia(true);
    expect(resolveTheme('system')).toBe('dark');
    os.set(false);
    expect(resolveTheme('system')).toBe('light');
  });
});

describe('setThemePreference', () => {
  it('paints and persists', () => {
    stubMatchMedia(false);
    setThemePreference('dark');
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_KEY)).toBe('dark');

    setThemePreference('light');
    expect(isDark()).toBe(false);
    expect(window.localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('paints system as whatever the OS is', () => {
    stubMatchMedia(true);
    setThemePreference('system');
    expect(isDark()).toBe(true);
    expect(window.localStorage.getItem(THEME_KEY)).toBe('system');
  });

  it('still paints when the write throws', () => {
    stubMatchMedia(false);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(isDark()).toBe(true);
  });
});

describe('syncTheme', () => {
  it('paints the stored preference on mount', () => {
    stubMatchMedia(false);
    window.localStorage.setItem(THEME_KEY, 'dark');
    syncTheme();
    expect(isDark()).toBe(true);
  });

  it('follows the OS while the preference is system', () => {
    const os = stubMatchMedia(false);
    syncTheme();
    expect(isDark()).toBe(false);
    os.set(true);
    expect(isDark()).toBe(true);
    os.set(false);
    expect(isDark()).toBe(false);
  });

  it('ignores the OS once the preference is explicit', () => {
    const os = stubMatchMedia(false);
    syncTheme();
    setThemePreference('light');
    os.set(true);
    expect(isDark()).toBe(false);
  });

  it('unsubscribes', () => {
    const os = stubMatchMedia(false);
    const stop = syncTheme();
    expect(os.listenerCount).toBe(1);
    stop();
    expect(os.listenerCount).toBe(0);
    os.set(true);
    expect(isDark()).toBe(false);
  });
});
