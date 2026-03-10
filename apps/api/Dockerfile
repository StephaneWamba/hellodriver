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
# Install all workspace packages to ensure node_modules exists for all
RUN pnpm install --frozen-lockfile

# ── build stage ───────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app
COPY --from=install /app/node_modules ./node_modules
COPY tsconfig.json ./
COPY package.json pnpm-workspace.yaml ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm --filter @hellodriver/config build
RUN pnpm --filter @hellodriver/validators build
RUN pnpm --filter @hellodriver/db build
RUN pnpm --filter @hellodriver/api build

# ── production image ──────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup --system hellodriver && adduser --system --ingroup hellodriver hellodriver

# Copy production dependencies and compiled code from build stage
COPY --from=build --chown=hellodriver:hellodriver /app/node_modules ./node_modules
COPY --from=build --chown=hellodriver:hellodriver /app/apps/api/dist ./dist
COPY --from=build --chown=hellodriver:hellodriver /app/apps/api/package.json ./

# Remove dev dependencies (ESLint, TypeScript, etc.) to reduce image size
RUN rm -rf node_modules/@types \
    && rm -rf node_modules/typescript* \
    && rm -rf node_modules/eslint* \
    && rm -rf node_modules/vitest* \
    && rm -rf node_modules/@vitest* \
    && true

USER hellodriver
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
