# Chase Cards (Pokémon + One Piece English · Phase 2B)

A Next.js prototype for browsing TCG sets and highlighting **chase cards** — the most valuable cards by live market price.

**Phase 2B:** **Pokémon** is live. **One Piece English**, MTG, and Sports are Coming Soon (OP adapter kept behind the category flag). Entitlements via localStorage; **Stripe Checkout** when env Price IDs are set (demo unlock fallback otherwise). See [STRIPE.md](./STRIPE.md).

## Features

- **Category switcher** — Pokémon (live); One Piece / MTG / Sports (Coming Soon)
- Pick any Pokémon TCG set from the official API set list
- Toggle between:
  1. **Chase cards** — top **20%** of cards in the set by market value (among cards with a usable market price; count is **rounded up**, minimum **1** if at least one priced card exists)
  2. **Entire set** — all cards, sorted by set number
- **Set statistics** (free + premium) — after a set loads, a stats panel shows:
  1. **Total set value** — sum of each card’s best usable TCGPlayer market price (USD), with a “based on N of M priced cards” note when some prices are missing
  2. **Month-over-month (MoM)** — percent change vs ~30-day Cardmarket averages via TCGdex (`avg`/`trend` vs `avg30`), or **N/A** with reason when data/age is insufficient
  - **Every metric (including N/A) shows a visible source line** under the value
- **Entitlements (demo localStorage)**:
  - **Free**: top **3** chase on every **live** catalog (Pokémon today)
  - **Premium $2.99**: buyer **chooses one** live category for full chase + entire set; other live categories stay top-3 until add-on / All Access
  - **Category add-on $1.99** (`pokemon`, `one-piece`, `mtg`, `sports`, and per-sport): unlock full depth on a live category not chosen for Premium (Pokémon add-on when Premium picked One Piece); MTG/Sports still reserve coming-soon
  - **All Access $9.99**: unlocks all categories (Stripe or demo)
  - Coming-soon categories: entitled → “catalog coming soon”; otherwise paywall CTAs.
  - Legacy `chase-cards-premium` / premium-without-category migrates to Premium + `premiumCategory: "pokemon"`
  - Shop panel + **Restore free / clear entitlements** for testing
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

**One Piece English (Phase 2B):** adapter in `src/lib/catalog/one-piece.ts`. Prefers OPTCG API when `OPTCG_API_KEY` is set; otherwise falls back to public [optcgapi.com](https://optcgapi.com) (`/api/allSets/`, `/api/sets/{id}/`). Images prefer `OPTCG /images/{card_id}` (public). MoM is N/A (no Cardmarket-style history). MTG / Sports adapters not built yet.

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
| `OPTCG_API_KEY` | No | `X-API-Key` for [OPTCG API](https://optcg-api.arjunbansal-ai.workers.dev). Without it, One Piece uses optcgapi.com fallback (sets/cards + prices). |
| `STRIPE_SECRET_KEY` / `STRIPE_PRICE_*` | No (demo fallback) | See [STRIPE.md](./STRIPE.md) for full Stripe Checkout env list and Netlify checklist. |

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
    api/sets/                      # GET set list (?category=pokemon|one-piece)
    api/sets/[setId]/cards/        # GET cards + prices + meta.stats
    api/sets/[setId]/stats/        # GET set statistics only
    api/stripe/checkout/           # POST create Checkout Session
    api/stripe/confirm/            # GET verify paid session → entitlements
    api/stripe/webhook/            # POST optional checkout.session.completed
  lib/catalog/                     # category adapters (pokemon, one-piece)
    page.tsx                       # Home UI shell
    layout.tsx
  components/
    ChaseApp.tsx                   # Client app: category, set picker, freemium, shop
    CategorySwitcher.tsx           # Pokémon / One Piece / MTG / Sports
    EntitlementShop.tsx            # Premium / add-ons / sports / All Access (Stripe + demo)
    SetStatsPanel.tsx              # Total / MoM with source lines
    CardTile.tsx                   # Optional locked/blur teaser state
    PremiumGate.tsx                # Unlock Premium $2.99 CTA / paywall
    SetSelector.tsx
    ViewToggle.tsx
    StatusPanel.tsx
  hooks/
    useEntitlements.ts             # Premium + add-ons + All Access (localStorage)
    usePremium.ts                  # Thin compatibility wrapper → entitlements
  lib/
    catalog/types.ts               # Category ids, labels, live | coming_soon
    entitlements.ts                # Entitlement model + sports add-ons + Stripe grants
    stripe/                        # Price map, Checkout helpers, session → entitlements
    api.ts                         # Pokémon TCG API client
    tcgdex.ts                      # TCGdex set resolve + price/MoM fallback (cached)
    prices.ts                      # Market price + chase selection
    stats.ts                       # Total / MoM builders
    types.ts
```

## How to demo Phase 2B (Deploy Preview / chasecards.online after merge)

1. Open the site — category chips at the top of the controls.
2. **Pokémon (Live)** — top 3 chase free; Premium (choose Pokémon) or Pokémon add-on / All Access for full depth.
3. **One Piece English (Coming Soon)** — adapter present behind flag; not selectable as live until shipped.
4. **MTG / Sports** — coming soon; entitled → “catalog coming soon”; otherwise paywall CTAs.
5. Use **Restore free / clear entitlements** (shop or header) to reset. Legacy Premium unlocks still migrate automatically.

## Stripe Checkout

Documented in **[STRIPE.md](./STRIPE.md)**. `POST /api/stripe/checkout`, `GET /api/stripe/confirm`, and optional webhook. Demo unlock when Stripe env is missing.

## License

Prototype for personal / demo use. Pokémon and card imagery are property of their respective owners.
