# Hello Driver Web

Vite + React PWA for booking rides on web/mobile.

## Phase 0 Scaffolding

- React 18 with TypeScript
- Vite for fast development and production builds
- PWA support for offline capability
- Supabase SDK for auth and real-time
- Responsive design

## Development

\`\`\`bash
pnpm install
pnpm dev
\`\`\`

## Building

\`\`\`bash
pnpm build
\`\`\`

## Deployment

Deploys to **Cloudflare Pages** via native GitHub integration (no API tokens needed).

**Setup:**
1. Go to https://dash.cloudflare.com/pages
2. **Create application** → **Connect to Git**
3. Select `StephaneWamba/hellodriver` repo
4. Create project: **`hellodriver-web`**
   - Build command: `pnpm --filter @hellodriver/web build`
   - Build output: `apps/web/dist`
5. Configure environment variables:
   - `VITE_SUPABASE_URL` = `${{ secrets.VITE_SUPABASE_URL }}`
   - `VITE_SUPABASE_ANON_KEY` = `${{ secrets.VITE_SUPABASE_ANON_KEY }}`
   - `VITE_API_URL` = `${{ secrets.VITE_API_URL }}`
   - `VITE_MAPBOX_TOKEN` = `${{ secrets.VITE_MAPBOX_TOKEN }}`

Push to `main` and Cloudflare Pages auto-deploys.
