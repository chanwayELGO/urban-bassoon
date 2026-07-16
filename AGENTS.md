# AGENTS.md

Instructions for coding agents working on TravelPal (`urban-bassoon`).

## Stack

- Vite + React 19 + TypeScript PWA
- Mobile-first UI (`max-width: 480px` shell, safe-area insets)
- Cloudflare Pages Function AI proxy: `functions/api/ai.ts`
- Persistence: `localStorage` keys prefixed `tc_*`

## Source of truth

- **Edit** files under `src/` and `functions/`.
- **Do not edit** `src/legacy/`, `index.legacy.html`, or run generation unless explicitly asked.
- Opt-in only: `npm run generate:app` / `npm run generate:split` (overwrites split modules from legacy).
- `npm run build` is `vite build` only — it must not regenerate sources.

## Hard constraints

1. Preserve all `tc_*` / `tc_${tripId}_*` localStorage key names (user data).
2. Client AI calls go through `callAi` → `POST /api/ai`. Never call Gemini, Anthropic, or Workers AI from the browser.
3. Keep mobile-first layout: 480px shell, tab bar safe-bottom padding, touch targets.
4. Never commit secrets (`.dev.vars`, API keys). Use `GEMINI_API_KEY` in env / Cloudflare.

## Layout map

| Path | Purpose |
|------|---------|
| `src/components/tabs/` | Home, Plan, Pack, Budget, Explore, Memories, Docs |
| `src/components/shared/` | Modals, drawers, swipeable rows |
| `src/lib/` | storage, ai client, calendar, sync, trip helpers |
| `functions/api/ai.ts` | Gemini primary + Workers AI fallback, rate limits |
| `src/styles/globals.css` | Global mobile-first styles |

## Verification loop

Before finishing a task:

```bash
npm run check
npm run build
```

Fix lint/format with `npm run lint:fix` when needed.

## AI proxy notes

- Request shape: `{ task, system?, messages, maxTokens? }`
- Vision tasks (`ocr`, `caption`) → Gemini Flash; text → Flash-Lite; fallback → Workers AI
- Local `PagesFunction` type lives in `functions/api/ai.ts` (avoid `@cloudflare/workers-types` DOM clash)
