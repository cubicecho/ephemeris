import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Vite's own env handling only reaches VITE_-prefixed variables in client code,
// not `process.env` out here — so the repo-root files are loaded by hand, the
// same way db/drizzle.config.ts does it, and for the same reason: `.env.local`
// first, because `loadEnvFile` leaves an already-set variable alone.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const file of ['.env.local', '.env']) {
  const envPath = path.join(root, file);
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

// The app talks to a relative /graphql, proxied here in dev so the token never
// crosses origins. In production the server serves dist/ from the same origin.
// Point EPHEMERIS_SERVER_URL elsewhere to develop against a remote server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    dedupe: ['react', 'react-dom'],
  },
  server: {
    // Listen on all interfaces — dev often runs on a VM or remote docker host,
    // where vite's localhost-only default would be unreachable.
    host: true,
    port: 3000,
    proxy: {
      '/graphql': process.env.EPHEMERIS_SERVER_URL ?? 'http://localhost:3005',
    },
  },
});
