import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineProject, mergeConfig } from 'vitest/config';
import appConfig from './vite.config.ts';

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** Rendering a page under axe on a loaded machine crosses Vitest's default. A stuck story still fails. */
const STORY_TIMEOUT_MS = 30_000;

/**
 * A container grants no user namespaces, and its 64 MB /dev/shm kills the renderer mid-run. Both present as "browser
 * connection was closed".
 */
const CHROMIUM_ARGS = ['--no-sandbox', '--disable-dev-shm-usage'];

// Every story, run as a test in a real Chromium. It merges the app's own Vite config because a story needs the plugins
// the app is built with: React and Tailwind.
export default mergeConfig(
  appConfig,
  defineProject({
    plugins: [storybookTest({ configDir: path.join(appDir, '.storybook') })],
    test: {
      name: 'stories',
      browser: {
        enabled: true,
        headless: true,
        provider: playwright({ launchOptions: { args: CHROMIUM_ARGS } }),
        instances: [{ browser: 'chromium' }],
      },
      // After the node and dom projects, never beside them: a database built per test file and a Chromium on one
      // machine push the database's hooks past their timeout.
      sequence: { groupOrder: 1 },
      // Parallel browser sessions drop their websocket partway through a run.
      fileParallelism: false,
      testTimeout: STORY_TIMEOUT_MS,
    },
  }),
);
