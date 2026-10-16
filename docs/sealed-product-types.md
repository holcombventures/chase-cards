# Sealed product types for Box EV

Box EV prices one sealed product, not “a box” in the abstract. The same set can list a 36-pack booster box, a 6-pack bundle, an ETB, a single pack, and a case. Those are different TCGplayer SKUs with different pack counts and different market prices. The calculator names the SKU, uses that SKU’s market, and multiplies pack EV by the packs in that product.

Live names and prices come from TCGCSV, the public daily mirror of TCGplayer. Products are matched by name against the type rules in `src/lib/tools/sealed-products.json`. The JSON is keyed by game, then by product type. A set override can change the pack count, cards per pack, rate table, or a guaranteed bonus hit. The page does not ship a frozen copy of every SKU.

## Pack counts

These are the defaults. The visitor can edit the pack count. A case is not a separate choice. The case multiplier (×N) prices N copies of the selected product and scales pack EV, including a once-per-product bonus, by the same N.

| Game | Product | Packs | Notes |
| --- | --- | --- | --- |
| Pokémon | Booster box | 36 | Hidden on special sets |
| Pokémon | Half booster box | 18 | Hidden on special sets |
| Pokémon | Booster bundle | 6 | Default on special sets when one exists |
| Pokémon | Elite Trainer Box | 9 | Accessories not valued. Often has a promo |
| Pokémon | Pokémon Center ETB | 11 | Accessories not valued. Often has a promo |
| Pokémon | 3-pack blister | 3 | Promo optional |
| Pokémon | 2-pack blister | 2 | Promo optional |
| Pokémon | Art bundle | 4 | |
| Pokémon | Sleeved pack or booster pack | 1 | |
| One Piece | Booster box | 24 | Premium Booster is 20 packs of 10 cards |
| One Piece | Sleeved pack or booster pack | 1 | |
| Lorcana | Booster box | 24 | |
| Lorcana | Illumineer's Trove | 8 | Accessories not valued |
| Lorcana | Sleeved pack or booster pack | 1 | |
| Riftbound | Booster display | 24 | This is the sealed unit. Other “display” names are wholesale and are dropped |
| Riftbound | Sleeved pack or booster pack | 1 | |
| Gundam | Booster box | 24 | |
| Gundam | Edition Beta box | 16 | 9-card packs, plus 1 random Legend Rare in the box |
| Gundam | Edition Beta pack | 1 | 9 cards. No guaranteed Legend Rare |
| Gundam | Sleeved pack or booster pack | 1 | |

EV is packs × per-pack EV at that set’s rate table. The verdict compares the product’s market (×N when a case multiplier is set) with that pack EV only.

## Pokémon special sets

Some Pokémon sets are not sold as a 36-pack booster box. Confirmed against TCGCSV group names: Scarlet & Violet 151, Paldean Fates, Crown Zenith, Prismatic Evolutions, Ascended Heroes, and 30th Celebration. The same rule covers Shrouded Fable, Celebrations, Shining Fates, and Hidden Fates. A set is special when its name contains one of those phrases.

On those sets the selector hides Booster Box and Half Booster Box. The default is a Booster Bundle when one is listed, otherwise an Elite Trainer Box, otherwise a Pokémon Center ETB. Prismatic Evolutions (TCGCSV group 23821, “SV: Prismatic Evolutions”) has a Booster Bundle (6), an ETB (9), and a Pokémon Center ETB (11). It does not have a booster box. Destined Rivals is not special: it has a booster box, so the box stays available.

## Products left out

These are not given a pack EV. When the set has at least one product that EV applies to, they are omitted from the selector and the page says how many were left out, with the sentence “EV not applicable: fixed or mixed contents”. When a set has only those products, they are the choices and the result is that sentence instead of Good buy, Fair, or Overpriced.

Left out:

- Code cards, and anything with a collector number or a card rarity (singles, including One Piece DON!! cards).
- Japanese, Chinese, Korean, and Thai SKUs.
- Anything with “case” in the name. Buyers use the ×N multiplier instead.
- Wholesale “display” SKUs that are not a “booster display”.
- Starter decks, Proving Grounds, champion decks, Lorcana gift boxes, collection starter sets, and prerelease boxes.
- Mixed-set Pokémon tins and collections, unless the name matches a known pack product such as a bundle or blister. A tin whose pack list is not in the product name stays fixed.
- Event and anniversary bundles, build and battle kits, and deck build boxes.
- Surprise and club bundles (Costco, Sam’s) that are not a plain booster bundle.

Riftbound Origins Proving Grounds is a box set plus a case. Both drop out of pack EV, so the only result is the fixed-contents note.

## Promo, accessories, and the verdict

The verdict uses pack EV only.

A promo is optional and off by default. It applies to ETBs and pack blisters, which are flagged `promo` in the type table. When the visitor turns it on, the add-on is the median TCGplayer market of cards whose name matches the bracket in the SKU, for example `[Umbreon]`. If nothing matches, the line says the promo price is unknown and the add-on is $0. Either way it stays out of the verdict.

Sleeves, dice, energy, and the box itself are accessories. ETBs, Pokémon Center ETBs, and the Illumineer's Trove are labeled “Accessories not valued” and those extras count as $0.

## One Piece Premium Booster

PRB-01 and PRB-02 (TCGCSV groups 23496 and 24305) sell a “Premium Booster - Booster Box”, a case, a pack, and a sleeved pack, plus DON!! cards. The box is 20 packs of 10 cards, not a 24-pack main-set box. The rate table `one-piece-prb` is an unconfirmed estimate: 4 common, 3 uncommon, 1.5 rare, 7 super rare, 5 leader, 2 secret, 3 alternate art, and 0.25 case-hit per 20 packs. It is labeled an estimate on the result.

## Gundam Edition Beta

Edition Beta (TCGCSV group 24193, abbreviation GD01_b) lists “Gundam Card Game Edition Beta Box” and “Edition Beta Pack”. The box is 16 packs of 9 cards plus one guaranteed random Legend Rare. That Legend Rare is a bonus hit on the box, once per box, not a per-pack rate. A loose Edition Beta pack is one 9-card pack and does not include the Legend Rare. The `gundam-edition-beta` table (5 common, 3 uncommon, 1 rare, chase slots at 0, plus the box bonus) is an unconfirmed estimate.

## Rates and the price line

Every result uses the set’s rate table and shows an “Estimated rates” badge. Published pack structures (Pokémon TCGplayer Infinite, Ravensburger’s 12-card pack, Riot’s Origins notes) and community opening counts are starting points. They are not official odds, and the visitor can edit hits per pack. Unconfirmed tables say so in the product note.

The price starts from the Normal TCGplayer market for that exact product (the lowest other subtype if Normal is missing). The result and the share image name the product and the pack count, for example “Pitch Black · Booster Box (36 packs)”, and include “Price source: TCGplayer sealed market for this exact product”. When the case multiplier is above 1, the source line adds “× N products” and the title adds “× N”.

Lorcana and Riftbound stay free and keep their fan notices on the result and the share image.
