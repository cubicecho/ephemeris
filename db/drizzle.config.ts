import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'drizzle-kit';

// drizzle-kit runs this file with db/ as the cwd, but the env files live one
// level up at the repo root. Load them here so `npm run db:generate` needs no
// wrapper.
//
// `.env.local` first: `process.loadEnvFile` leaves a variable alone once it is
// set, so the first file to name one wins — the opposite of `--env-file`.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(root, file);
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL is required. Copy .env.example to .env, then run `npm run db:up`.');
}

export default defineConfig({
  out: './drizzle',
  schema: './src/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url },
});
