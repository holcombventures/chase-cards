# Stripe Checkout (chase-cards)

One-time **Checkout Sessions** (`mode=payment`) for Premium, All Access, category add-ons, and per-sport add-ons.  
Until user accounts exist, **client confirm** (`GET /api/stripe/confirm`) is the primary grant path: after success redirect, the homepage reads `session_id`, verifies `payment_status === paid`, and writes entitlements to `localStorage`.

Demo unlock remains when `STRIPE_SECRET_KEY` or the matching `STRIPE_PRICE_*` is missing (local / preview without Stripe).

## Routes

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/stripe/checkout` | Body `{ entitlement }` → create Checkout Session → `{ url, sessionId }` |
| `GET` | `/api/stripe/confirm?session_id=` | Retrieve session; if paid, return `{ entitlements: [...] }` |
| `POST` | `/api/stripe/webhook` | Optional `checkout.session.completed` (signature via `STRIPE_WEBHOOK_SECRET`); log/ack |

### Entitlement keys

`premium` · `all_access` · `one-piece` · `mtg` · `sports` · `sports-baseball` · `sports-basketball` · `sports-football` · `sports-hockey` · `sports-soccer`

Success URL: `/?checkout=success&session_id={CHECKOUT_SESSION_ID}`  
Cancel URL: `/?checkout=cancel`

## Environment variables

Set these in **Netlify → Site settings → Environment variables** (and optionally `.env.local` for local smoke). Never commit secret values.

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | Yes (for live pay) | Secret key (`sk_test_…` / `sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | Optional until webhook | Signing secret (`whsec_…`) for `/api/stripe/webhook` |
| `STRIPE_PRICE_PREMIUM` | For Premium Checkout | Stripe Price ID (`price_…`) |
| `STRIPE_PRICE_ALL_ACCESS` | For All Access | Stripe Price ID |
| `STRIPE_PRICE_ONE_PIECE` | For One Piece add-on | Stripe Price ID |
| `STRIPE_PRICE_MTG` | For MTG add-on | Stripe Price ID |
| `STRIPE_PRICE_SPORTS` | Optional alias | Single generic Sports product Price ID |
| `STRIPE_PRICE_SPORTS_BASEBALL` | Per-sport | Baseball add-on Price ID |
| `STRIPE_PRICE_SPORTS_BASKETBALL` | Per-sport | Basketball |
| `STRIPE_PRICE_SPORTS_FOOTBALL` | Per-sport | Football |
| `STRIPE_PRICE_SPORTS_HOCKEY` | Per-sport | Hockey |
| `STRIPE_PRICE_SPORTS_SOCCER` | Per-sport | Soccer |
| `NEXT_PUBLIC_SITE_URL` | Recommended on Netlify | Canonical origin for success/cancel URLs (e.g. `https://chasecards.online`). Falls back to Netlify `URL` / request Host. |

## Netlify checklist (Bobby)

1. Add `STRIPE_SECRET_KEY` (test first, then live).
2. Create Products/Prices in Stripe Dashboard for each SKU above; paste Price IDs into the matching `STRIPE_PRICE_*` vars.
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
- Pokémon entitlements are unchanged: free top-3 chase; Premium / All Access for full depth.
- Webhook is best-effort logging until accounts exist; do not rely on it alone for grants.
