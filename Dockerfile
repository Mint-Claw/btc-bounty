# BTC-Bounty — Multi-stage Docker build
# Build: docker build -t btc-bounty .
# Run:   docker run -p 3000:3000 --env-file .env btc-bounty

FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
# better-sqlite3 needs build tools for native bindings
RUN apk add --no-cache python3 make g++
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# --- Build ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js (standalone output for minimal image)
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# --- Production ---
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build + static assets
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# better-sqlite3 native bindings (required at runtime)
COPY --from=deps /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=deps /app/node_modules/bindings ./node_modules/bindings
COPY --from=deps /app/node_modules/prebuild-install ./node_modules/prebuild-install
COPY --from=deps /app/node_modules/file-uri-to-path ./node_modules/file-uri-to-path

# Data directory for SQLite + payment tracking
RUN mkdir -p /app/.data && chown nextjs:nodejs /app/.data
ENV BTCBOUNTY_DATA_DIR=/app/.data

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
