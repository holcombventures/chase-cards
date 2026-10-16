# Sealed product types

Box EV prices one sealed SKU. Pack EV is packs times the per-pack rates for that set. The verdict uses pack EV only. A promo is an optional add-on and starts off. Accessories and fixed decks count as $0. A product whose packs come from mixed sets, or whose pack list is not known, is not given a pack EV.

Live names and prices come from TCGCSV. `src/lib/tools/sealed-products.json` holds the type rules below. A set shows only the SKUs that match. Japanese, Chinese, Korean, and Thai SKUs are dropped. A case is not its own choice. The ×N multiplier starts at 1. The case sizes below are estimates and are not verified.

Pack counts that this note marks as estimates stay editable.

## Pokémon

Scarlet & Violet and Mega Evolution era packs are 10 cards plus 1 Energy.

| Product | Packs | EV |
| --- | --- | --- |
| Booster display box | 36, no extras | Yes. This is the baseline |
| Enhanced booster display | 36 plus 1 promo | Yes, plus the promo |
| Booster bundle | 6 | Yes |
| Elite Trainer Box | 9 plus 1 full-art promo and accessories | Partial |
| Pokémon Center ETB | 11 plus 2 promos | Partial |
| Build & Battle | 4 plus a fixed 40-card deck and 1 of 4 promos | Partial |
| Sleeved pack, 1-pack blister, 3-pack blister | 1–3 | Yes, or partial when a promo is included |
| Mini tin | 2 | Partial. The count is an estimate |
| Other tins and collections | Often 4–10, and often mixed sets | Only when the pack list is known |
| Super-Premium Collection | 15 | Partial |
| Ultra-Premium Collection | 16 | Partial |
| Case | 6 boxes of 36 | Estimate. Not applied until the multiplier is set |

Special sets have no 36-pack box. That includes 151, Paldean Fates, Crown Zenith, Prismatic Evolutions, Ascended Heroes, 30th Celebration, and the same kind of set (Shrouded Fable, Celebrations, Shining Fates, Hidden Fates). Those sets hide the booster box and the enhanced display and open on a booster bundle or an ETB.

Japanese boxes (30 packs of 5 cards) and Chinese gem packs are excluded.

A generic tin or collection stays out of pack EV. Mini tin, Super-Premium, and Ultra-Premium are the collection products with a stated pack count. Other tins stay out because the pack list is not in the product name, and tin counts are not verified.

## One Piece

English packs are 12 cards. Bandai publishes no English pull rates, so every One Piece table is a community estimate.

| Product | Packs | EV |
| --- | --- | --- |
| Booster box | 24 | Yes. Baseline |
| Extra Booster | 24, its own set | Yes, on that set's card prices, with the same community rate table |
| Premium Booster | 20 packs of 10 cards | Its own rate model. Two foil DON!! cards are reported and not verified, so they are not in the pack EV |
| Double Pack | 2 plus 1 DON!! | Partial. The DON!! card is not in the pack EV |
| Starter decks | Fixed deck | No |
| Case | 12 boxes of 24 | Estimate |

Japanese product is excluded.

## Lorcana

Packs are 12 cards. A booster box is 24 packs. The reported MSRP is $143.76. The calculator uses the TCGplayer market for the SKU, not that MSRP.

| Product | Packs | EV |
| --- | --- | --- |
| Booster box | 24 | Yes |
| Illumineer's Trove | 8 plus accessories | Partial |
| Prerelease box | 6 plus 1 promo | Partial |
| Gift box | 5, from mixed older sets | No |
| Collection Starter Set | 4, mixed sets | No |
| Starter deck | 2 plus a fixed deck | Partial. Packs only |
| Case | 4 boxes of 24 | Estimate |

## Riftbound

Packs are 14 cards. Riot's Origins rates, used for a booster display: an Epic in about 1 of 4 packs, about 2 alt arts per display, an overnumbered card in about 1 of 72 packs (about one display in three), and a signature in about 1 of 720 packs.

| Product | Packs | EV |
| --- | --- | --- |
| Booster display | 24 | Yes. This is the sealed unit |
| Vault | 6 plus accessories | Partial |
| Pre-Rift Kit | 5 plus a fixed champion pack and a promo | Partial |
| Champion deck | 1 plus a fixed deck | Partial |
| Showdown | 2 plus decks | Partial |
| Sleeved booster | 1 | Yes |
| Proving Grounds and event bundles | Fixed or mixed | No |

No case size is listed for Riftbound.

## Gundam

A normal pack is 12 cards plus 1. A booster box is 24 packs. Starter decks are not given an EV.

Edition Beta is its own model: 16 beta packs of 9 cards, 56 fixed cards, and 1 random Legend Rare. The reported price is $69.99. Pack EV uses the 16 packs plus the one Legend Rare. The 56 fixed cards are not valued. The price in the calculator is the TCGplayer market, not $69.99.

The 1st Anniversary Set and Premium Collections are not given an EV.

A case is typically 12 boxes of 24. That size is an estimate.

## Not verified

These stay labeled as estimates:

- The Premium Booster foil DON!! guarantee, and the Premium Booster rates
- Pokémon tin pack counts, including the mini tin's 2 packs
- Gundam 1st Anniversary Set contents
- Case sizes: Pokémon ×6, One Piece ×12, Lorcana ×4, Gundam ×12

## Sources

pokemoncenter.store, pokemon.com product galleries, ForeverGeek (Pokémon Center ETB), TCG Gilbert (ETB), en.onepiece-cardgame.com, opboxindex.com, Rarewaves (Premium Booster), ravensburger.us, icv2.com, disneylorcana.com, merch.riotgames.com, riftbound.org, gundam-gcg.com, gundamcard.gg/edition-beta.

Pull-rate starting points for the main sets are cited in `src/lib/tools/boxEv.ts`. Premium Booster and Edition Beta use separate tables and are marked unconfirmed there.
