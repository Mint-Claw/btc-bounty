# BTC-Bounty — Production Dockerfile
# Multi-stage build for Next.js with standalone output
#
# Build:  docker build -t btc-bounty .
# Run:    docker run -p 3000:3000 --env-file .env btc-bounty

# ── Stage 1: Dependencies ─────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy lock files first for better layer caching
COPY package.json pnpm-lock.yaml* package-lock.json* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then npm ci; \
    else npm install; fi

# ── Stage 2: Build ─────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set Next.js standalone output for minimal production image
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN if [ -f pnpm-lock.yaml ]; then pnpm build; \
    else npm run build; fi

# ── Stage 3: Production ───────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Security: run as non-root
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone build output
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Create data directory for SQLite (persistent volume mount point)
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME /app/data

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
