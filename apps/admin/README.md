# Hello Driver Admin

Vite + React dashboard for operations and admin tasks.

## Phase 0 Scaffolding

- React 18 with TypeScript
- Vite for fast development and production builds
- Supabase SDK for auth
- Admin utilities for monitoring

## Development

```bash
pnpm install
pnpm dev
```

## Building

```bash
pnpm build
```

## Deployment

Deploys to **Cloudflare Pages** via native GitHub integration (no API tokens needed).

**Setup:**
1. Go to https://dash.cloudflare.com/pages
2. **Create application** → **Connect to Git**
3. Select `StephaneWamba/hellodriver` repo
4. Create project: **`hellodriver-admin`**
   - Build command: `pnpm --filter @hellodriver/admin build`
   - Build output: `apps/admin/dist`
5. Configure environment variables:
   - `VITE_SUPABASE_URL` = `${{ secrets.VITE_SUPABASE_URL }}`
   - `VITE_SUPABASE_ANON_KEY` = `${{ secrets.VITE_SUPABASE_ANON_KEY }}`
   - `VITE_API_URL` = `${{ secrets.VITE_API_URL }}`

Push to `main` and Cloudflare Pages auto-deploys.
