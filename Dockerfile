# Pinned to the Bun version the tests run on. Change it deliberately.
FROM oven/bun:1.3.10-slim AS base
WORKDIR /app

# Every workspace's manifest has to exist for the lockfile to be accepted.
FROM base AS manifests
COPY package.json bun.lock ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/auth/package.json packages/auth/
COPY packages/db/package.json packages/db/
COPY packages/events/package.json packages/events/
COPY packages/migrate/package.json packages/migrate/

FROM manifests AS build
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:web

# Only what the server needs at runtime, without the web app's build tools.
FROM manifests AS dependencies
RUN bun install --frozen-lockfile --production --filter '@smelp/api'

FROM base AS release
ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/smelp.sqlite
# Copied whole, because each workspace has its own node_modules linked into the root.
COPY --from=dependencies /app .
COPY package.json tsconfig.json ./
COPY migrations migrations
COPY apps/api apps/api
COPY packages packages
COPY --from=build /app/apps/web/dist apps/web/dist
RUN mkdir /data && chown bun:bun /data
VOLUME /data
USER bun
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD ["bun", "-e", "fetch(`http://localhost:${process.env.PORT}/api/status`).then(r => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["bun", "apps/api/src/index.ts"]
