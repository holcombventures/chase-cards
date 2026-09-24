# Stripe Checkout (chase-cards)

One-time **Checkout Sessions** (`mode=payment`) for Premium, All Access, category add-ons, and per-sport add-ons.  
Until user accounts exist, **client confirm** (`GET /api/stripe/confirm`) is the primary grant path: after success redirect, the homepage reads `session_id`, verifies `payment_status === paid`, and writes entitlements to `localStorage`.

Demo unlock remains when `STRIPE_SECRET_KEY` or the matching `STRIPE_PRICE_*` is missing (local / preview without Stripe).

## Routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/stripe/checkout` | Body `{ entitlement, premiumCategory? }` → create Checkout Session → `{ url, sessionId }` |
| `GET` | `/api/stripe/confirm?session_id=` | Retrieve session; if paid and the Price ID matches the metadata plan, return `{ entitlements: [...] }`. Otherwise `{ entitlements: [], error }` and grant nothing. |
| `POST` | `/api/stripe/webhook` | Optional `checkout.session.completed` (signature via `STRIPE_WEBHOOK_SECRET`); log/ack |

### Entitlement keys

`premium` · `all_access` · `pokemon` · `one-piece` · `mtg` · `sports` · `sports-baseball` · `sports-basketball` · `sports-football` · `sports-hockey` · `sports-soccer`

For **`premium`**, also pass **`premiumCategory`**: `"pokemon"` | `"one-piece"` (live categories only). Stored on the Checkout Session as metadata `premium_category` and applied on confirm.

Success URL: `/?checkout=success&session_id={CHECKOUT_SESSION_ID}`  
Cancel URL: `/?checkout=cancel`

## Environment variables

Set these in **Netlify → Site settings → Environment variables** (and optionally `.env.local` for local smoke). Never commit secret values.

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes (for live pay) | Secret key (`sk_test_…` / `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Optional until webhook | Signing secret (`whsec_…`) for `/api/stripe/webhook` |
| `STRIPE_PRICE_PREMIUM` | For Premium Checkout | Its own one-time Price ID (`price_…`) at **$2.99**. A shared add-on Price is rejected. |
| `STRIPE_PRICE_ALL_ACCESS` | For All Access | Its own one-time Price ID at **$9.99**. A shared add-on Price is rejected. |
| `STRIPE_PRICE_POKEMON` | For Pokémon add-on | One-time **$1.99**. May be the same Price ID as every other add-on var. |
| `STRIPE_PRICE_ONE_PIECE` | For One Piece add-on | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_MTG` | For MTG add-on | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_SPORTS` | Sports category add-on | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_SPORTS_BASEBALL` | Per-sport | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_SPORTS_BASKETBALL` | Per-sport | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_SPORTS_FOOTBALL` | Per-sport | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_SPORTS_HOCKEY` | Per-sport | Same shared **$1.99** Price ID is fine. |
| `STRIPE_PRICE_SPORTS_SOCCER` | Per-sport | Same shared **$1.99** Price ID is fine. |
| `NEXT_PUBLIC_SITE_URL` | Recommended on Netlify | Canonical origin for success/cancel URLs (e.g. `https://chasecards.online`). Falls back to Netlify `URL` / request Host. |

## Netlify checklist (Bobby)

1. Add `STRIPE_SECRET_KEY` (test first, then live).
2. Create **three** one-time Prices: Premium **$2.99**, one shared add-on **$1.99**, All Access **$9.99**. Put the Premium and All Access IDs in their own env vars. Paste the same $1.99 Price ID into every add-on var (`STRIPE_PRICE_POKEMON`, `STRIPE_PRICE_ONE_PIECE`, `STRIPE_PRICE_MTG`, `STRIPE_PRICE_SPORTS`, and each `STRIPE_PRICE_SPORTS_*`).
3. (Optional) Deploy preview/branch, then add webhook endpoint:  
   `https://<deploy-url>/api/stripe/webhook` → event `checkout.session.completed` → copy `STRIPE_WEBHOOK_SECRET`.
4. Set `NEXT_PUBLIC_SITE_URL` to the production (or branch) origin so Checkout returns to the right host.
5. Trigger a deploy of branch `stripe-checkout` (do **not** merge to `main` until you’re ready).
6. Smoke: shop → Unlock → Stripe Checkout test card `4242…` → return → success banner + entitlements in Application → Local Storage → `chase-cards-entitlements`.

## Local smoke

```bash
cp .env.example .env.local
# fill STRIPE_SECRET_KEY + at least STRIPE_PRICE_PREMIUM
npm run dev
```

Without keys, buttons still **demo unlock** so Pokémon freemium keeps working offline.

## Notes

- Generic **Sports** category stays `coming_soon` until Phase sports adapters. Purchasing `sports-*` sets `entitlements.sports[]` for future use; any sport (or `sports` add-on) also marks the Sports chip as entitled.
- **Premium choose-one model**: one `STRIPE_PRICE_PREMIUM` Price ID; category choice is session **metadata** (`premium_category`), not a separate Price. No conflict with existing Premium Price ID.
- **Three Prices are enough.** One shared $1.99 one-time Price may be stored in every add-on env var. Premium ($2.99) and All Access ($9.99) each need their own Price ID. Checkout still looks up the Price for the requested key, and writes that key to `metadata.entitlement`.
- **Grants use metadata only.** `GET /api/stripe/confirm` grants `session.metadata.entitlement` after checking the paid line-item Price ID. Add-ons accept any configured add-on Price ID. Premium and All Access must equal their own Price ID, and that ID must not also be an add-on Price. Missing or invalid metadata, or a Price that fails the check, grants nothing and returns `Paid price does not match the purchased plan.` (or a missing-entitlement error). Confirm does not choose a plan by reversing the Price ID.
- **Webhook stays log-only.** It loads the session line items and runs the same grant rule, then logs `entitlements` and `grantError`. It does not write entitlements.
- **Pokémon add-on:** set `STRIPE_PRICE_POKEMON` (the shared $1.99 ID is enough) or Pokémon add-on checkout returns `demoFallback`.
- Free: top-3 chase on every live category. Premium ($2.99): full depth on the chosen live category only. Add-on ($1.99): full depth on another live category (Pokémon, One Piece, MTG, Sports, and each per-sport key). All Access ($9.99): all categories.
- Display copy uses `src/lib/planPrices.ts`. Checkout does not fetch Stripe Price amounts; it charges whatever one-time Price ID is currently in the matching env var. Until those vars point at the new Prices, the shop can show $2.99 / $1.99 / $9.99 while Checkout still charges the old Price.
- Legacy buyers with `premium: true` and no `premiumCategory` migrate to `premiumCategory: "pokemon"`.
- Webhook is best-effort logging until accounts exist; do not rely on it alone for grants.
