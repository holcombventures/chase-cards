# Pokémon TCG Chase Cards

A Next.js prototype for browsing Pokémon Trading Card Game sets and highlighting **chase cards** — the most valuable cards by live market price.

## Features

- Pick any Pokémon TCG set from the official API set list
- Toggle between:
  1. **Chase cards** — top **20%** of cards in the set by market value (among cards with a usable market price; count is **rounded up**, minimum **1** if at least one priced card exists)
  2. **Entire set** — all cards, sorted by set number
- **Set statistics** (free + premium) — after a set loads, a stats panel shows:
  1. **Total set value** — sum of each card’s best usable TCGPlayer market price (USD), with a “based on N of M priced cards” note when some prices are missing
  2. **Month-over-month (MoM)** — percent change vs ~30-day Cardmarket averages via TCGdex (`avg`/`trend` vs `avg30`), or **N/A** with reason when data/age is insufficient
  3. **Year-over-year (YoY)** — **N/A** when the set is under a year old or when no reliable YoY history exists (**never invented**)
  - **Every metric (including N/A) shows a visible source line** under the value
- **Freemium soft-lock (demo)**:
  - **Free**: only the top **3** chase cards, labeled “Top 3 chase”, plus a locked remainder section with counts (e.g. “19 more chase · 122 in set”) and Unlock Premium **$4.99** CTA
  - Free users who switch to **Entire set** see an upgrade gate (not the full grid)
  - **Premium $4.99** (localStorage demo unlock, no Stripe): full chase list + entire set; header has “Restore free” for demos
- Each card tile shows: name, number/set info, labeled latest market price, and card photo (locked teasers blur name/price)
- Loading, empty, and error states (including API rate limits)
- **No invented prices** — if TCGPlayer market data is missing, the UI shows “Price unavailable”; if the API fails, a clear error is shown
- **TCGdex price fallback** — when a set has zero Pokémon TCG API market prices (common for Mega Evolution sets such as Chaos Rising / Pitch Black), prices are loaded from [TCGdex](https://tcgdex.dev) (TCGPlayer `marketPrice`, highest variant wins)

## Chase definition

1. Load all cards for the selected set from the Pokémon TCG API.
2. Keep only cards that have at least one usable **TCGPlayer `market`** price (across print variants such as `normal`, `holofoil`, `reverseHolofoil`, etc.).
3. For each card, take the **highest** `market` value among those variants (best market value for ranking).
4. Sort those priced cards by market price **descending**.
5. Take the top `ceil(pricedCount × 0.20)` cards (at least 1 when `pricedCount > 0`).

Cards without market prices are excluded from chase ranking but still appear in **Entire set**.

## Set statistics

| Metric | How it’s computed | Source label (examples) |
|---|---|---|
| Total set value | Sum of best usable TCGPlayer market prices already used for chase | `Source: Pokémon TCG API (TCGPlayer)` / `Source: TCGdex (TCGPlayer)` / mixed |
| MoM | Σ Cardmarket `avg` (else `trend`) vs Σ `avg30` on TCGdex; **N/A** if set &lt; ~30 days old or insufficient data | `Source: TCGdex (Cardmarket, ~30-day avg)` |
| YoY | **N/A** if release date &lt; 365 days ago (“Set less than a year old”); otherwise **N/A** (“YoY history not available yet”) until a real history source is wired — **never invented** | Intended-source note on every N/A |

Stats are returned in `GET /api/sets/[setId]/cards` `meta.stats` (and also available at `GET /api/sets/[setId]/stats`). TCGdex card bundles are cached in-memory so price fallback and MoM share one load when fallback already ran.

## Data source

**Primary:** [Pokémon TCG API v2](https://api.pokemontcg.io/v2) — [docs](https://docs.pokemontcg.io)

- Sets: `GET /v2/sets`
- Cards by set: `GET /v2/cards?q=set.id:{setId}`
- Images: `images.pokemontcg.io`
- Prices: `tcgplayer.prices.*.market` when present

**Fallback / MoM:** [TCGdex API](https://api.tcgdex.net) (no key)

- Set list / detail: `GET /v2/en/sets`, `GET /v2/en/sets/{id}`
- Full card pricing: `GET /v2/en/cards/{id}`
- Prefer TCGPlayer `marketPrice` (highest among variants) for USD tiles. Cardmarket EUR `avg`/`trend`/`avg30` powers MoM % only (not shown as USD).
- Set id mapping differs slightly (e.g. pokemontcg `me4` ↔ tcgdex `me04`, `me5` ↔ `me05`, `sv8` ↔ `sv08`); resolution prefers exact set **name** match, then id heuristics

This app is **not** affiliated with Nintendo, The Pokémon Company, TCGPlayer, or TCGdex.

## Stack

- Next.js (App Router) + TypeScript
- Tailwind CSS
- Server API routes that proxy the Pokémon TCG API (optional API key stays server-side)

## Setup

```bash
cd pokemon-chase-cards
npm install
```

### Environment (optional)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

| Variable | Required | Description |
|---|---|---|
| `POKEMONTCG_API_KEY` | No | API key from [dev.pokemontcg.io](https://dev.pokemontcg.io). Without it, public access is used and rate limits are stricter. If you hit HTTP 429, add a key and restart. |

## Run

Development:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Production build:

```bash
npm run build
npm start
```

## Project structure

```
src/
  app/
    api/sets/                      # GET set list
    api/sets/[setId]/cards/        # GET cards + prices + meta.stats
    api/sets/[setId]/stats/        # GET set statistics only
    page.tsx                       # Home UI shell
    layout.tsx
  components/
    ChaseApp.tsx                   # Client app: set picker, toggle, stats, freemium
    SetStatsPanel.tsx              # Total / MoM / YoY with source lines
    CardTile.tsx                   # Optional locked/blur teaser state
    PremiumGate.tsx                # Unlock Premium $4.99 CTA / paywall
    SetSelector.tsx
    ViewToggle.tsx
    StatusPanel.tsx
  hooks/
    usePremium.ts                  # localStorage premium flag (demo)
  lib/
    api.ts                         # Pokémon TCG API client
    tcgdex.ts                      # TCGdex set resolve + price/MoM fallback (cached)
    prices.ts                      # Market price + chase selection
    stats.ts                       # Total / MoM / YoY builders
    types.ts
```

## License

Prototype for personal / demo use. Pokémon and card imagery are property of their respective owners.
