# TravelPal (urban-bassoon)

A mobile-first travel companion PWA — plan trips, pack, budget, explore, capture memories, and sync with your travel crew.

**Coding agents:** read [AGENTS.md](./AGENTS.md) first. `src/` is the source of truth.

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
| Lint / format | Biome |
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
| `npm run build` | Production Vite build (`dist/`) |
| `npm run preview` | Preview production build locally |
| `npm run check` | Biome lint + format check |
| `npm run lint` | Same as `check` |
| `npm run lint:fix` | Auto-fix lint/format issues |
| `npm run format` | Format with Biome |
| `npm run pages:dev` | Serve `dist` with Cloudflare Pages Functions |
| `npm run generate:app` | Opt-in: regenerate App from legacy (overwrites) |
| `npm run generate:split` | Opt-in: re-split monolith into modules (overwrites) |

## Project Structure

```
urban-bassoon/
├── AGENTS.md               # Canonical instructions for coding agents
├── index.html              # Vite entry
├── index.legacy.html       # Original monolith (archive only)
├── public/
│   └── manifest.json       # PWA manifest
├── src/                    # Source of truth — edit here
│   ├── main.tsx
│   ├── App.tsx
│   ├── styles/globals.css
│   ├── lib/
│   ├── components/tabs/
│   ├── components/shared/
│   └── legacy/             # Archive — do not edit for normal work
├── functions/
│   └── api/ai.ts           # Cloudflare Pages Function — LLM proxy
├── scripts/                # Opt-in codegen only
├── biome.json
└── wrangler.toml
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
