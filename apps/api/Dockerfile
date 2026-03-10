FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ── install stage: fetch and install all dependencies ───────────────────────
FROM base AS install
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/validators/package.json packages/validators/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @hellodriver/api...

# ── build stage ───────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY --from=install /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=install /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=install /app/packages/db/node_modules ./packages/db/node_modules
COPY --from=install /app/packages/validators/node_modules ./packages/validators/node_modules
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @hellodriver/config build || true
RUN pnpm --filter @hellodriver/validators build
RUN pnpm --filter @hellodriver/db build
RUN pnpm --filter @hellodriver/api build

# ── prune production deps ──────────────────────────────────────────────────────
FROM install AS prune
WORKDIR /app
RUN pnpm prune --prod --filter @hellodriver/api...

# ── production image ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup --system hellodriver && adduser --system --ingroup hellodriver hellodriver

# Copy only production dependencies and compiled code
COPY --from=prune --chown=hellodriver:hellodriver /app/node_modules ./node_modules
COPY --from=prune --chown=hellodriver:hellodriver /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=hellodriver:hellodriver /app/apps/api/dist ./dist
COPY --from=build --chown=hellodriver:hellodriver /app/apps/api/package.json ./
COPY --from=build --chown=hellodriver:hellodriver /app/packages/db/dist ./node_modules/@hellodriver/db/dist
COPY --from=build --chown=hellodriver:hellodriver /app/packages/validators/dist ./node_modules/@hellodriver/validators/dist

USER hellodriver
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
