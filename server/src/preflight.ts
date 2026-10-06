// Environment checks that must run before anything opens a connection or signs a
// token. Imported for its side effects as the very first import of index.ts, so
// a misconfigured instance fails with a sentence rather than a stack trace.

/** What the server signs with outside production when JWT_SECRET is unset. */
const DEV_SECRET = 'dev-secret-change-in-production';
/** The secret .env.example ships with. */
const PLACEHOLDER_SECRET = 'change-me-to-a-long-random-string';
/** Shortest signing secret production accepts, in characters. `openssl rand -hex 32` gives 64. */
const MIN_SECRET_LENGTH = 32;

function fatal(message: string): never {
  console.error(`FATAL: ${message}`);
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  fatal('DATABASE_URL is required. Copy .env.example to .env, then run `npm run db:up` for a local Postgres.');
}

if (process.env.NODE_ENV === 'production') {
  const secret = process.env.JWT_SECRET ?? '';
  const isTooShort = secret.length < MIN_SECRET_LENGTH;
  const isPublished = secret === DEV_SECRET || secret === PLACEHOLDER_SECRET;
  // Session tokens are signed with this and nothing else. A known or guessable
  // secret means anyone can mint a token for any account.
  if (isTooShort || isPublished) {
    fatal('JWT_SECRET must be set to a strong random value in production. Generate one with `openssl rand -hex 32`.');
  }
}
