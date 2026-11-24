# syntax=docker/dockerfile:1
# Production image of DevMentor (README, "Deploy to a VPS"). Two runnable targets:
#   runner  — the Next.js standalone server (default target), non-root, healthcheck on /api/health
#   migrate — one-shot `npm run db:migrate` (MikroORM CLI), run before the app starts
# No env file is copied in (.dockerignore); configuration arrives at runtime from the compose env file.

ARG NODE_VERSION=22

# Dependencies from the lockfile only. --ignore-scripts: no install script runs in the build
# (none is needed for the build or the migrator; agent-browser's browser download is test-only).
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/app/package.json packages/app/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --ignore-scripts --no-audit --no-fund

# Source tree on top of the dependencies (shared by the build and the migrator).
FROM deps AS source
COPY . .

# Production build with standalone output (packages/app/next.config.ts, NEXT_OUTPUT).
FROM source AS builder
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT=standalone
RUN npm run build

# One-shot migrator: needs the MikroORM CLI, tsx and the TypeScript migrations (dev dependencies).
FROM source AS migrate
ENV NODE_ENV=production
USER node
CMD ["npm", "run", "db:migrate"]

# Runtime: only the traced standalone server, static assets and public files.
FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=builder --chown=node:node /repo/packages/app/.next/standalone ./
COPY --from=builder --chown=node:node /repo/packages/app/.next/static ./packages/app/.next/static
COPY --from=builder --chown=node:node /repo/packages/app/public ./packages/app/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "packages/app/server.js"]
