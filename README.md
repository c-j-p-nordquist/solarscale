# Solar Scale

An interactive 3D true-scale visualization of the Solar System built with Three.js and TypeScript.

## Quickstart

```bash
npm install
npm run dev
```

| Script | Does |
|---|---|
| `npm run dev` | Vite dev server on :5173 |
| `npm run build` | Typecheck (`tsc`) and production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run deploy` | Build and deploy to Cloudflare Workers via Wrangler |

## Deploy

The site is a static build (`npm run build` → `dist/`) served as static assets by **Cloudflare Workers** through Workers Builds (Git integration) or `npm run deploy`. `wrangler.jsonc` names the Worker (`solarscale`) and points it at `dist/`; there is no Worker script.

One-time setup in the Cloudflare dashboard — *Workers & Pages → Create → Import a repository*, pick `c-j-p-nordquist/solarscale`, then:

| Setting | Value |
|---|---|
| Project name | `solarscale` (must match `name` in `wrangler.jsonc`) |
| Production branch | `main` |
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler preview` |
| Root directory | *(leave empty)* |

Node 22 is picked up from `.node-version`. `public/_headers` caches the fingerprinted `/assets/*` forever and always revalidates `index.html`.
