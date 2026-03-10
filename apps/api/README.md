# Hello Driver API

Fastify v5 REST API with Socket.io real-time support.

## Phase 0 Scaffolding

- Fastify server with Zod type validation
- PostgreSQL/PostGIS with Drizzle ORM
- Redis for caching and job queues (BullMQ)
- Supabase Auth integration
- Socket.io for real-time trip matching
- Sentry error tracking

## Development

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Deployment

Deploys to Fly.io (jnb region) on push to main.
