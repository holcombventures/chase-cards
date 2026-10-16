/**
 * Modeled booster-box EV.
 * Pack count and per-rarity pull rates are estimates the visitor edits.
 * The starting box price is the TCGplayer market for a sealed booster box
 * or display when that SKU is in the same TCGCSV category feed. Otherwise
 * it is a placeholder. Either way the visitor can change it. Nothing here
 * is an official odd.
 *
 * Each slot uses the median of its priced cards, not the arithmetic mean.
 * A mean is the right expectation only when every printing in the slot is
 * equally likely. One $1,000 alternate in a slot of much cheaper printings
 * is not, and it was pulling One Piece, Gundam, and Riftbound to 2–4× the
 * box. Even counts take the mean of the two central prices.
 *
 * Default rates are starting points from public pack structures and opening
 * notes. Chase printings (Iconic, manga, signed, LR++) are their own slots
 * so they are not priced as if they were commons. A second pass checked
 * these per-box counts against the sources below and left them there:
 * the gap was the mean and the placeholder box price, not a doubled hit.
 *
 * Sources:
 * - Pokémon: TCGplayer Infinite, "Pokémon TCG: Pitch Black Pull Rates"
 *   (https://www.tcgplayer.com/content/article/Pokémon-TCG-Pitch-Black-Pull-Rates/069a5fda-2d1f-44a1-97de-b6dcdc5abfb8/).
 *   Double Rare ~1 in 5, Ultra Rare ~1 in 12, Illustration Rare ~1 in 9,
 *   Special Illustration Rare ~1 in 80, Mega Hyper Rare ~1 in 1,081.
 *   Commons and uncommons follow the Scarlet & Violet pack (4 and 3) from
 *   TCGplayer's Scarlet & Violet pull-rate article. 36 packs per box.
 *   ACE SPEC ~1 per box only matters for sets that have those cards.
 * - Lorcana: Ravensburger lists 12 cards (6 common, 3 uncommon, 2 rare or
 *   higher, 1 foil) and 24 packs per box. Legendary ~6 per box and Epic ~2
 *   per box follow the Attack of the Vine! opening notes at
 *   https://tcgtalk.com/guides/attack-of-the-vine-pull-rates (9 boxes; the
 *   author flags creator skew). Enchanted ~1 in 96 packs is the long-running
 *   community figure summarized by Cambridge TCG
 *   (https://www.cambridgetcg.com/pulls/lorcana). Iconic ~1 in 1,600 packs is
 *   the r/Lorcana Fabled case tracker, which trusted case openings over
 *   self-reported boxes (https://www.reddit.com/r/Lorcana/comments/1njnhso/).
 * - One Piece: no Bandai odds. Community box maps (r/OnePieceTCG primer
 *   https://www.reddit.com/r/OnePieceTCG/comments/1jgnfii/) put a 24-pack
 *   box near 8 base leaders, 7 super rares, ~2 rares in the rare slots, and
 *   2–3 alternate-art hits. Manga and super alternates are not in that
 *   regular hit map; this model gives that whole case-hit group about one
 *   card per 12-box case. Box toppers are left out of booster EV.
 * - Riftbound: Riot, "Collectability in Riftbound: Origins"
 *   (https://playriftbound.com/en-us/news/announcements/collectability-in-riftbound-origins/)
 *   and the Origins sell sheet: 7 commons, 3 uncommons, 2 rare-or-better,
 *   24 packs. Epic ~1 in 4 packs, alt-art ~2 per box, overnumbered ~1 per 3
 *   boxes, signed overnumbered ~1 in 720 packs (about 1 in 10 overnumbered).
 * - Gundam: Bandai publishes no odds. Retailer pack notes used here are 6
 *   common, 4 uncommon, 2 rare-or-better, 24 packs (Cambridge TCG
 *   https://cambridgetcg.com/pulls/gundam). GD04/GD05 opening roundups put
 *   Legend Rare near 8 per box, LR+ and R+ near 1–2 per box, Link Rare near
 *   4 in GD05, SP near 1 in 5 boxes, and LR++ near one per 12-box case or
 *   rarer (https://tcgtalk.com/guides/freedom-ascension-pull-rates).
 */

import type { ToolCategoryId } from "./categories";

export const ESTIMATE_LABEL = "estimate, edit me";

export const GOOD_BUY_MAX_RATIO = 0.85;
export const FAIR_MAX_RATIO = 1.1;

export type BoxVerdict = "Good buy" | "Fair" | "Overpriced" | "Need prices";

export type EvCard = {
  id: string;
  name: string;
  rarity?: string | null;
  number?: string | null;
  marketPrice: number | null;
};

export type RaritySlot = {
  id: string;
  label: string;
  /** Expected copies of this printed rarity in one pack. */
  hitsPerPack: number;
};

export type BoxEvDefaults = {
  packsPerBox: number;
  /**
   * Placeholder street price, used only when the sealed-box market is missing.
   * The calculator replaces it with the TCGplayer market when TCGCSV has one.
   */
  boxPrice: number;
  slots: RaritySlot[];
};

export type BoxEvRow = {
  id: string;
  label: string;
  hitsPerPack: number;
  hitsPerBox: number;
  cardCount: number;
  pricedCount: number;
  /** Median market price of priced cards in this slot. */
  typicalPrice: number | null;
  slotEv: number;
};

export type BoxEvModel = {
  modeledEv: number;
  pricedCards: number;
  rows: BoxEvRow[];
};

const POKEMON_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 4 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 0.5 },
  { id: "double-rare", label: "Double Rare", hitsPerPack: 0.21 },
  { id: "ultra-rare", label: "Ultra Rare", hitsPerPack: 0.083 },
  { id: "illustration-rare", label: "Illustration Rare", hitsPerPack: 0.11 },
  { id: "special-illustration-rare", label: "Special Illustration Rare", hitsPerPack: 0.0125 },
  { id: "hyper-rare", label: "Hyper Rare", hitsPerPack: 0.0009 },
  { id: "ace-spec", label: "ACE SPEC", hitsPerPack: 0.028 },
  { id: "secret", label: "Secret Rare", hitsPerPack: 0.02 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const ONE_PIECE_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 6 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 1.6 },
  { id: "super-rare", label: "Super Rare", hitsPerPack: 7 / 24 },
  { id: "leader", label: "Leader", hitsPerPack: 8 / 24 },
  { id: "secret", label: "Secret Rare", hitsPerPack: 0.5 / 24 },
  { id: "alt", label: "Alternate art", hitsPerPack: 2.25 / 24 },
  { id: "case-hit", label: "Manga / super alt", hitsPerPack: 1 / (12 * 24) },
  { id: "sp", label: "Special", hitsPerPack: 2 / (12 * 24) },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const LORCANA_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 6 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 0.85 },
  { id: "super-rare", label: "Super Rare", hitsPerPack: 0.9 },
  { id: "legendary", label: "Legendary", hitsPerPack: 0.25 },
  { id: "epic", label: "Epic", hitsPerPack: 2 / 24 },
  { id: "enchanted", label: "Enchanted", hitsPerPack: 1 / 96 },
  { id: "iconic", label: "Iconic", hitsPerPack: 1 / 1600 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const RIFTBOUND_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 7 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 1.75 },
  { id: "epic", label: "Epic", hitsPerPack: 0.25 },
  { id: "alt-art", label: "Alt art", hitsPerPack: 2 / 24 },
  { id: "overnumbered", label: "Overnumbered", hitsPerPack: 1 / (3 * 24) },
  { id: "signature", label: "Signature", hitsPerPack: 1 / 720 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const GUNDAM_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 6 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 4 },
  { id: "rare", label: "Rare", hitsPerPack: 1.3 },
  { id: "legend", label: "Legend Rare", hitsPerPack: 8 / 24 },
  { id: "lr-plus", label: "LR+", hitsPerPack: 1.5 / 24 },
  { id: "r-plus", label: "R+", hitsPerPack: 1.5 / 24 },
  { id: "link", label: "Link Rare", hitsPerPack: 4 / 24 },
  { id: "c-plus", label: "C+", hitsPerPack: 1 / 24 },
  { id: "u-plus", label: "U+", hitsPerPack: 0.5 / 24 },
  { id: "sp", label: "SP", hitsPerPack: 0.2 / 24 },
  { id: "lr-plus-plus", label: "LR++", hitsPerPack: 1 / (12 * 24) },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

/** Unconfirmed. A Premium Booster box is 20 packs, not a 24-pack main set. */
const ONE_PIECE_PRB_HITS: Record<string, number> = {
  common: 4,
  uncommon: 3,
  rare: 1.5,
  "super-rare": 7 / 20,
  leader: 5 / 20,
  secret: 2 / 20,
  alt: 3 / 20,
  "case-hit": 0.25 / 20,
  sp: 0,
  other: 0,
};

/**
 * Unconfirmed 9-card Edition Beta pack. The guaranteed Legend Rare is a
 * bonus hit on the box, not a per-pack rate.
 */
const GUNDAM_BETA_HITS: Record<string, number> = {
  common: 5,
  uncommon: 3,
  rare: 1,
  legend: 0,
  "lr-plus": 0,
  "r-plus": 0,
  link: 0,
  "c-plus": 0,
  "u-plus": 0,
  sp: 0,
  "lr-plus-plus": 0,
  other: 0,
};

const ONE_PIECE_PRB_SLOTS: RaritySlot[] = ONE_PIECE_SLOTS.map((slot) => ({
  ...slot,
  hitsPerPack: ONE_PIECE_PRB_HITS[slot.id] ?? 0,
}));

const GUNDAM_BETA_SLOTS: RaritySlot[] = GUNDAM_SLOTS.map((slot) => ({
  ...slot,
  hitsPerPack: GUNDAM_BETA_HITS[slot.id] ?? 0,
}));

export const RATE_TABLES = {
  standard: null,
  "one-piece-prb": ONE_PIECE_PRB_SLOTS,
  "gundam-edition-beta": GUNDAM_BETA_SLOTS,
} as const;

export type RateTableId = keyof typeof RATE_TABLES;

export const ESTIMATED_RATES_LABEL = "Estimated rates";
export const PRICE_SOURCE_LABEL = "Price source: TCGplayer sealed market for this exact product";
export const EV_NOT_APPLICABLE = "EV not applicable: fixed or mixed contents";
export const ACCESSORIES_NOT_VALUED = "Accessories not valued";

/** The required price-source sentence, plus a case count when the visitor buys more than one. */
export function exactPriceSource(multiplier: number): string {
  const count = Number.isFinite(multiplier) && multiplier > 1 ? Math.round(multiplier) : 1;
  return count > 1 ? `${PRICE_SOURCE_LABEL} × ${count} products` : PRICE_SOURCE_LABEL;
}

export function slotsForRate(category: ToolCategoryId, rateTable: string): RaritySlot[] {
  const table = RATE_TABLES[rateTable as RateTableId];
  const slots = table ?? BOX_EV_DEFAULTS[category].slots;
  return slots.map((slot) => ({ ...slot }));
}

export function rateTableIsUnconfirmed(rateTable: string): boolean {
  return rateTable === "one-piece-prb" || rateTable === "gundam-edition-beta";
}

export const BOX_EV_DEFAULTS: Record<ToolCategoryId, BoxEvDefaults> = {
  pokemon: { packsPerBox: 36, boxPrice: 180, slots: POKEMON_SLOTS },
  "one-piece": { packsPerBox: 24, boxPrice: 120, slots: ONE_PIECE_SLOTS },
  lorcana: { packsPerBox: 24, boxPrice: 150, slots: LORCANA_SLOTS },
  riftbound: { packsPerBox: 24, boxPrice: 140, slots: RIFTBOUND_SLOTS },
  gundam: { packsPerBox: 24, boxPrice: 120, slots: GUNDAM_SLOTS },
};

/** Short citation shown under the calculator for the selected game. */
export const BOX_EV_SOURCES: Record<ToolCategoryId, string> = {
  pokemon:
    "Defaults follow TCGplayer Infinite's Pitch Black rates (about 1 Double Rare in 5 packs, 1 Ultra Rare in 12, 1 Illustration Rare in 9, 1 Special Illustration Rare in 80, 1 Mega Hyper Rare in 1,081) and the Scarlet & Violet pack of 4 commons, 3 uncommons, and 36 packs. ACE SPEC is about 1 per box on sets that have them.",
  "one-piece":
    "Defaults follow community 24-pack box maps: about 8 base leaders, 7 super rares, and 2–3 alternate arts. Manga and super alternates share about one pull per 12-box case. Box toppers are not counted. Bandai does not publish odds.",
  lorcana:
    "Ravensburger's pack is 6 common, 3 uncommon, 2 rare-or-higher, and 1 foil, with 24 packs in a box. Legendary is about 6 per box and Epic about 2, from Attack of the Vine! openings. Enchanted is about 1 in 96 packs. Iconic is about 1 in 1,600 packs, from the r/Lorcana Fabled case tracker.",
  riftbound:
    "Defaults follow Riot's Origins notes: 7 commons, 3 uncommons, an Epic in about 1 of 4 packs, about 2 alt-arts per 24-pack box, an overnumbered card about 1 box in 3, and a signed card about 1 in 720 packs.",
  gundam:
    "Pack shape used here is 6 common, 4 uncommon, and 2 rare-or-better, 24 packs. Community GD04 and GD05 openings put Legend Rare near 8 per box, LR+ and R+ near 1–2, Link Rare near 4, SP near 1 in 5 boxes, and LR++ near one per 12-box case or rarer. Bandai does not publish odds.",
};

export function cloneBoxDefaults(category: ToolCategoryId): BoxEvDefaults {
  const defaults = BOX_EV_DEFAULTS[category];
  return {
    packsPerBox: defaults.packsPerBox,
    boxPrice: defaults.boxPrice,
    slots: defaults.slots.map((slot) => ({ ...slot })),
  };
}

function rarityText(card: EvCard): string {
  return `${card.rarity || ""} ${card.name || ""}`.toLowerCase();
}

export function classifyCard(category: ToolCategoryId, card: EvCard): string {
  if (category === "pokemon") return classifyPokemon(card);
  if (category === "one-piece") return classifyOnePiece(card);
  if (category === "lorcana") return classifyLorcana(card);
  if (category === "riftbound") return classifyRiftbound(card);
  return classifyGundam(card);
}

function classifyPokemon(card: EvCard): string {
  const text = rarityText(card);
  if (/ace\s*spec/.test(text)) return "ace-spec";
  if (/special\s*illustration\s*rare|\bsir\b/.test(text)) return "special-illustration-rare";
  if (/illustration\s*rare|\bir\b/.test(text)) return "illustration-rare";
  if (/hyper\s*rare|rare\s*rainbow|rainbow\s*rare/.test(text)) return "hyper-rare";
  if (/secret\s*rare|rare\s*secret/.test(text)) return "secret";
  if (/ultra\s*rare/.test(text)) return "ultra-rare";
  if (/double\s*rare|rare\s*holo\s*v|rare\s*holo\s*ex/.test(text)) return "double-rare";
  if (/rare\s*holo|holo\s*rare/.test(text)) return "rare";
  if (/uncommon/.test(text)) return "uncommon";
  if (/\bcommon\b/.test(text)) return "common";
  if (/\brare\b/.test(text)) return "rare";
  return "other";
}

function onePieceFinish(name: string): "topper" | "case-hit" | "alt" | "base" {
  const text = name.toLowerCase();
  if (text.includes("box topper")) return "topper";
  if (text.includes("manga") || /super\s+(alternate|leader|parallel)/.test(text)) return "case-hit";
  if (text.includes("alternate art") || text.includes("parallel")) return "alt";
  return "base";
}

function classifyOnePiece(card: EvCard): string {
  const finish = onePieceFinish(card.name || "");
  if (finish === "topper") return "other";
  if (finish === "case-hit") return "case-hit";
  if (finish === "alt") return "alt";
  const rarity = (card.rarity || "").trim().toLowerCase();
  const token = rarity.replace(/[^a-z0-9]+/g, "");
  if (token === "sp" || rarity === "special") return "sp";
  if (token === "tr" || /treasure/.test(rarity)) return "other";
  if (token === "l" || /leader/.test(rarity)) return "leader";
  if (token === "sec" || /secret/.test(rarity)) return "secret";
  if (token === "sr" || /super/.test(rarity)) return "super-rare";
  if (token === "uc" || /uncommon/.test(rarity)) return "uncommon";
  if (token === "c" || rarity === "common") return "common";
  if (token === "r" || rarity === "rare") return "rare";
  return "other";
}

function classifyLorcana(card: EvCard): string {
  const text = (card.rarity || "").toLowerCase();
  if (/iconic/.test(text)) return "iconic";
  if (/enchanted/.test(text)) return "enchanted";
  if (/epic/.test(text)) return "epic";
  if (/legendary/.test(text)) return "legendary";
  if (/super\s*rare/.test(text)) return "super-rare";
  if (/uncommon/.test(text)) return "uncommon";
  if (/common/.test(text)) return "common";
  if (/rare/.test(text)) return "rare";
  return "other";
}

function classifyRiftbound(card: EvCard): string {
  const name = (card.name || "").toLowerCase();
  const number = (card.number || "").toLowerCase();
  const rarity = (card.rarity || "").toLowerCase();
  if (number.includes("*") || /signature/.test(name)) return "signature";
  if (/overnumbered/.test(name)) return "overnumbered";
  if (
    rarity === "showcase" ||
    /alternate art/.test(name) ||
    /^sp\d/.test(number) ||
    /^r\d+a$/.test(number.replace(/\s/g, ""))
  ) {
    return "alt-art";
  }
  if (/epic/.test(rarity)) return "epic";
  if (/uncommon/.test(rarity)) return "uncommon";
  if (/common/.test(rarity)) return "common";
  if (/rare/.test(rarity)) return "rare";
  return "other";
}

function classifyGundam(card: EvCard): string {
  const rarity = (card.rarity || "").toLowerCase().replace(/\s+/g, "");
  const name = (card.name || "").toLowerCase();
  if (name.includes("(sp)")) return "sp";
  if (rarity.includes("lr++") || name.includes("lr++")) return "lr-plus-plus";
  if (rarity.includes("lr+") || name.includes("lr+")) return "lr-plus";
  if (name.includes("link rare")) return "link";
  if (rarity.includes("r+") || name.includes("(r+)")) return "r-plus";
  if (rarity.includes("u+") || name.includes("(u+)")) return "u-plus";
  if (rarity.includes("c+") || name.includes("(c+)")) return "c-plus";
  if (/legend/.test(rarity)) return "legend";
  if (/uncommon/.test(rarity) || rarity === "u") return "uncommon";
  if (/common/.test(rarity) || rarity === "c") return "common";
  if (/rare/.test(rarity) || rarity === "r") return "rare";
  return "other";
}

function usablePrice(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/**
 * Median of the prices a slot actually has. Even counts use the mean of the
 * two central values, so two prices of 1 and 3 still land on 2.
 */
export function medianPrice(values: readonly number[]): number | null {
  const sorted: number[] = [];
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) sorted.push(value);
  }
  if (!sorted.length) return null;
  sorted.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function modelBoxEv(input: {
  cards: readonly EvCard[];
  slots: readonly RaritySlot[];
  packsPerBox: number;
  classify: (card: EvCard) => string;
  /** Hits added once per product, such as Edition Beta's guaranteed Legend Rare. */
  bonusHits?: readonly { slotId: string; hits: number }[];
}): BoxEvModel {
  const packs = Number.isFinite(input.packsPerBox) && input.packsPerBox > 0 ? input.packsPerBox : 0;
  const bonus = new Map<string, number>();
  for (const extra of input.bonusHits ?? []) {
    if (!Number.isFinite(extra.hits) || extra.hits <= 0) continue;
    bonus.set(extra.slotId, (bonus.get(extra.slotId) ?? 0) + extra.hits);
  }
  const groups = new Map<string, EvCard[]>();
  for (const card of input.cards) {
    const id = input.classify(card);
    const list = groups.get(id);
    if (list) list.push(card);
    else groups.set(id, [card]);
  }

  let modeledEv = 0;
  let pricedCards = 0;
  const rows = input.slots.map((slot) => {
    const list = groups.get(slot.id) ?? [];
    const priced = list.filter((card) => usablePrice(card.marketPrice));
    pricedCards += priced.length;
    const hitsPerPack =
      Number.isFinite(slot.hitsPerPack) && slot.hitsPerPack > 0 ? slot.hitsPerPack : 0;
    const hitsPerBox = hitsPerPack * packs + (bonus.get(slot.id) ?? 0);
    const typicalPrice = medianPrice(priced.map((card) => card.marketPrice as number));
    const slotEv = typicalPrice === null ? 0 : typicalPrice * hitsPerBox;
    modeledEv += slotEv;
    return {
      id: slot.id,
      label: slot.label,
      hitsPerPack,
      hitsPerBox,
      cardCount: list.length,
      pricedCount: priced.length,
      typicalPrice,
      slotEv,
    };
  });

  return { modeledEv, pricedCards, rows };
}

/**
 * Good buy: box price is 85% or less of modeled EV.
 * Fair: above that, up to 110%.
 * Overpriced: above 110%.
 */
export function boxEvVerdict(boxPrice: number, modeledEv: number, pricedCards: number): BoxVerdict {
  if (pricedCards <= 0 || !Number.isFinite(modeledEv) || modeledEv <= 0) return "Need prices";
  if (!Number.isFinite(boxPrice) || boxPrice < 0) return "Need prices";
  const ratio = boxPrice / modeledEv;
  if (ratio <= GOOD_BUY_MAX_RATIO) return "Good buy";
  if (ratio <= FAIR_MAX_RATIO) return "Fair";
  return "Overpriced";
}

export function boxPriceRatio(boxPrice: number, modeledEv: number): number | null {
  if (!Number.isFinite(boxPrice) || !Number.isFinite(modeledEv) || modeledEv <= 0) return null;
  return boxPrice / modeledEv;
}
