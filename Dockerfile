# ---- Base ----
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json bun.lock* ./
RUN npm install --legacy-peer-deps

# ---- Builder ----
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build Next.js
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runner ----
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma schema (for potential migrations)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./

# Create data directories
RUN mkdir -p /app/data/assets /app/data/thumbnails

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
ENV DATA_DIR=/app/data
ENV DATABASE_URL=file:/app/data/custom.db

CMD ["sh", "-c", "mkdir -p /app/data/assets /app/data/thumbnails && npx prisma db push --skip-generate --accept-data-loss || true; exec node server.js"]
