# Stream service image. Build context is the repository root:
#   docker build -f apps/stream/Dockerfile .
FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Workspace manifests first so dependency layers cache well.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml .npmrc tsconfig.base.json ./
COPY apps/stream/package.json apps/stream/
COPY packages/contracts/package.json packages/contracts/
COPY packages/core/package.json packages/core/
COPY packages/ui/package.json packages/ui/
COPY data/replays/package.json data/replays/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @second-order/stream...

# Sources (TypeScript runs through tsx; no build step needed for the service).
COPY packages/contracts packages/contracts
COPY packages/core packages/core
COPY data/replays data/replays
COPY apps/stream apps/stream

ENV NODE_ENV=production HOST=0.0.0.0
EXPOSE 4010
WORKDIR /app/apps/stream
# Apply migrations when a database is configured, then serve.
CMD ["sh", "-c", "if [ -n \"$DATABASE_URL\" ]; then npx tsx src/persistence/migrate.ts || echo 'migration failed, continuing in memory'; fi; exec npx tsx src/main.ts"]
