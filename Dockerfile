FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ── build stage ───────────────────────────────────────────────────────────────
FROM base AS build
WORKDIR /app

# Copy root files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json ./

# Copy all packages and apps
COPY packages ./packages
COPY apps/api ./apps/api

# Install all dependencies (using lock file)
RUN pnpm install --frozen-lockfile

# Build all packages
RUN pnpm --filter @hellodriver/config build
RUN pnpm --filter @hellodriver/validators build
RUN pnpm --filter @hellodriver/db build
RUN pnpm --filter @hellodriver/api build

# ── production image ──────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

# Non-root user for security
RUN addgroup --system hellodriver && adduser --system --ingroup hellodriver hellodriver

# Copy entire working directory from build (includes dist and node_modules)
COPY --from=build --chown=hellodriver:hellodriver /app .

# Remove source files, keep only compiled output and dependencies
RUN rm -rf apps/api/src packages/*/src tsconfig.json

USER hellodriver
EXPOSE 3000
ENV NODE_ENV=production

CMD ["node", "apps/api/dist/index.js"]
