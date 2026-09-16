# syntax=docker/dockerfile:1

# ── Stage 1: build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

COPY . .

# devDependencies included: codegen and the Vite build both need them.
RUN npm ci

# The GraphQL schema is generated from the Drizzle schema, so codegen imports
# @cubicecho/ephemeris-db — which refuses to load without a DATABASE_URL.
# postgres-js does not connect until a query runs, so a placeholder is enough.
ENV DATABASE_URL=postgres://build:build@127.0.0.1:5432/build
RUN npm run codegen && npm run build:app

# ── Stage 2: test ─────────────────────────────────────────────────────────────
# `docker build --target test -t ephemeris-test . && docker run --rm ephemeris-test`
FROM builder AS test

CMD ["npm", "test"]

# ── Stage 3: runtime ──────────────────────────────────────────────────────────
FROM node:24-alpine

WORKDIR /app

# Only the runtime workspaces are installed; Vite and its plugins exist to
# produce app/dist and are useless once it exists.
COPY package.json package-lock.json ./
COPY db/package.json db/
COPY server/package.json server/
COPY app/package.json app/
RUN npm ci --omit=dev --include-workspace-root --workspace @cubicecho/ephemeris-db --workspace @cubicecho/ephemeris-server \
 && npm cache clean --force

# The server is not compiled: it runs its TypeScript sources directly under
# --experimental-strip-types, so the sources are the build output.
COPY db/src db/src
COPY db/drizzle db/drizzle
COPY server/src server/src
COPY --from=builder /app/app/dist app/dist

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=3s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3005)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# No --preserve-symlinks: it would resolve @cubicecho/ephemeris-db to its path
# inside node_modules, and Node refuses to strip types from anything under there.
CMD ["node", "--experimental-strip-types", "server/src/index.ts"]
