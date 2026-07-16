# TravelPal (urban-bassoon)

A mobile-first travel companion PWA — plan trips, pack, budget, explore, capture memories, and sync with your travel crew.

## Features

- **Dashboard** — trip overview, weather, departure brief, quick actions
- **Plan** — itinerary, calendar export (ICS / Google / Outlook)
- **Pack** — checklist, templates, AI smart packing, weather re-check
- **Budget** — expenses, splits, receipt scan, daily limits
- **Explore** — weather, currency, visa tips, local discovery
- **Memories** — map pins, photos, AI captions
- **Docs** — document vault, printable trip export
- **Share & Sync** — JSONBlob trip sharing, live sync, crew chat

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Vite + React 19 + TypeScript |
| Styling | Mobile-first CSS (`max-width: 480px` shell) |
| Maps | Leaflet |
| Storage | `localStorage` (`tc_*` keys) |
| PWA | `vite-plugin-pwa` + service worker |
| AI | Gemini Flash (primary) + Cloudflare Workers AI (fallback) |
| Hosting | Cloudflare Pages (recommended) or GitHub Pages |

## Prerequisites

- Node.js 20+
- npm 10+
- (Optional) [Google AI Studio](https://aistudio.google.com/) API key for Gemini
- (Optional) Cloudflare account for Pages + Workers AI

## Getting Started

```bash
git clone https://github.com/chanwayELGO/urban-bassoon.git
cd urban-bassoon
npm install
npm run dev
```

Open http://localhost:5173

### Local AI proxy (optional)

```bash
cp .dev.vars.example .dev.vars
# Add your GEMINI_API_KEY to .dev.vars
npx wrangler pages dev dist --compatibility-date=2024-09-23
```

In another terminal, `npm run dev` proxies `/api/*` to wrangler (see `vite.config.ts`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server with HMR |
| `npm run build` | Generate App from legacy source, split components, production build |
| `npm run preview` | Preview production build locally |
| `npm run pages:dev` | Serve `dist` with Cloudflare Pages Functions |

## Project Structure

```
urban-bassoon/
├── index.html              # Vite entry
├── index.legacy.html       # Original monolith (reference)
├── public/
│   ├── manifest.json       # PWA manifest
│   └── sw.js               # Legacy SW (superseded by vite-plugin-pwa in prod)
├── src/
│   ├── main.tsx            # React bootstrap
│   ├── App.tsx             # Root app shell (generated)
│   ├── styles/globals.css  # Mobile-first styles
│   ├── lib/                # storage, AI client, calendar, sync, etc.
│   ├── components/
│   │   ├── tabs/           # Dashboard, Plan, Pack, Budget, Explore, Memories, Docs
│   │   └── shared/         # Modals, drawers, swipeable rows
│   └── legacy/app-body.jsx # Source for code generation
├── functions/
│   └── api/ai.ts           # Cloudflare Pages Function — LLM proxy
├── scripts/
│   ├── build-app.mjs       # Legacy → App.tsx transformer
│   └── split-components.mjs
└── wrangler.toml           # Cloudflare Pages + Workers AI config
```

## Deployment

### Cloudflare Pages (recommended)

1. Connect this repo to [Cloudflare Pages](https://pages.cloudflare.com/)
2. Build command: `npm run build`
3. Output directory: `dist`
4. Add environment variable: `GEMINI_API_KEY`
5. Workers AI is enabled via `wrangler.toml` (`[ai]` binding)

### GitHub Pages

A workflow at `.github/workflows/deploy-pages.yml` builds and deploys `dist` on push to `main`. AI features require a separate proxy — use Cloudflare Pages for full functionality.

## Environment Variables

| Variable | Where | Required |
|----------|-------|----------|
| `GEMINI_API_KEY` | Cloudflare Pages / `.dev.vars` | Recommended (primary AI) |
| Workers AI | Cloudflare account | Automatic fallback |

## License

GPL-3.0
