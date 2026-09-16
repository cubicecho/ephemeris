// Preload: load the repo-root env files before the main module initializes.
// Runs via --import so it executes ahead of hoisted ESM imports — ephemeris-db
// reads DATABASE_URL at import time, so it has to be in place by then.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// `.env.local` first, and that is not a typo: `process.loadEnvFile` leaves a
// variable alone once it is set, so the *first* file to name one wins. That is
// the opposite of `--env-file`, where the last file wins — which is why the
// package scripts list the same two files in the other order.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(root, file));
  } catch {
    // Not present — use the ambient environment as-is (Docker/CI).
  }
}
