import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { THEME_PRE_PAINT_SCRIPT } from '@/components/ui/theme-preference-base';

// The theme is cubeui's now — `useThemePreference` owns the storage key and the
// class on <html> — but index.html has to paint before any module loads, so it
// carries a copy of the rule. A copy is only safe while something compares it:
// a registry update that renames the key would otherwise flash white on every
// dark-theme load and fail nothing.
describe('index.html', () => {
  it('paints with the script cubeui publishes', () => {
    const html = readFileSync(path.resolve(__dirname, '../../index.html'), 'utf8');
    expect(html).toContain(`<script>${THEME_PRE_PAINT_SCRIPT}</script>`);
  });
});
