/**
 * Modeled booster-box EV.
 * Box price, pack count, and per-rarity pull rates are estimates the visitor
 * edits. Nothing here is an official odd or a market quote for a sealed box.
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
  /** Editable street-price guess. There is no sealed-box feed. */
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
  averagePrice: number | null;
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
  { id: "double-rare", label: "Double Rare", hitsPerPack: 0.3 },
  { id: "ultra-rare", label: "Ultra Rare", hitsPerPack: 0.15 },
  { id: "illustration-rare", label: "Illustration Rare", hitsPerPack: 0.08 },
  { id: "special-illustration-rare", label: "Special Illustration Rare", hitsPerPack: 0.03 },
  { id: "hyper-rare", label: "Hyper Rare", hitsPerPack: 0.01 },
  { id: "ace-spec", label: "ACE SPEC", hitsPerPack: 0.03 },
  { id: "secret", label: "Secret Rare", hitsPerPack: 0.01 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const ONE_PIECE_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 5 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 1.5 },
  { id: "super-rare", label: "Super Rare", hitsPerPack: 0.25 },
  { id: "secret", label: "Secret Rare", hitsPerPack: 0.04 },
  { id: "leader", label: "Leader", hitsPerPack: 0.04 },
  { id: "special", label: "Special / alt", hitsPerPack: 0.02 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const LORCANA_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 6 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 1.2 },
  { id: "super-rare", label: "Super Rare", hitsPerPack: 0.4 },
  { id: "legendary", label: "Legendary", hitsPerPack: 0.2 },
  { id: "epic", label: "Epic", hitsPerPack: 0.06 },
  { id: "enchanted", label: "Enchanted", hitsPerPack: 0.01 },
  { id: "iconic", label: "Iconic", hitsPerPack: 0.005 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const RIFTBOUND_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 5 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 3 },
  { id: "rare", label: "Rare", hitsPerPack: 1 },
  { id: "epic", label: "Epic", hitsPerPack: 0.15 },
  { id: "showcase", label: "Showcase", hitsPerPack: 0.08 },
  { id: "signature", label: "Signature", hitsPerPack: 0.01 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

const GUNDAM_SLOTS: RaritySlot[] = [
  { id: "common", label: "Common", hitsPerPack: 6 },
  { id: "uncommon", label: "Uncommon", hitsPerPack: 2.5 },
  { id: "rare", label: "Rare", hitsPerPack: 1 },
  { id: "c-plus", label: "C+", hitsPerPack: 0.3 },
  { id: "u-plus", label: "U+", hitsPerPack: 0.15 },
  { id: "r-plus", label: "R+", hitsPerPack: 0.1 },
  { id: "legend", label: "Legend Rare", hitsPerPack: 0.08 },
  { id: "lr", label: "LR / LR+ / LR++", hitsPerPack: 0.02 },
  { id: "other", label: "Other", hitsPerPack: 0 },
];

export const BOX_EV_DEFAULTS: Record<ToolCategoryId, BoxEvDefaults> = {
  pokemon: { packsPerBox: 36, boxPrice: 120, slots: POKEMON_SLOTS },
  "one-piece": { packsPerBox: 24, boxPrice: 95, slots: ONE_PIECE_SLOTS },
  lorcana: { packsPerBox: 24, boxPrice: 110, slots: LORCANA_SLOTS },
  riftbound: { packsPerBox: 24, boxPrice: 140, slots: RIFTBOUND_SLOTS },
  gundam: { packsPerBox: 24, boxPrice: 90, slots: GUNDAM_SLOTS },
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

function classifyOnePiece(card: EvCard): string {
  const rarity = (card.rarity || "").trim().toLowerCase();
  const name = (card.name || "").toLowerCase();
  const token = rarity.replace(/[^a-z0-9]+/g, "");
  if (token === "l" || /leader/.test(rarity)) return "leader";
  if (token === "sp" || /special/.test(rarity) || /manga/.test(rarity) || /manga/.test(name)) {
    return "special";
  }
  if (token === "sec" || /secret/.test(rarity)) return "secret";
  if (token === "sr" || /super/.test(rarity)) return "super-rare";
  if (token === "uc" || /uncommon/.test(rarity)) return "uncommon";
  if (token === "c" || rarity === "common") return "common";
  if (token === "r" || rarity === "rare") return "rare";
  if (/alt(?:ernate)?\s*art/.test(name)) return "special";
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
  const number = card.number || "";
  const rarity = (card.rarity || "").toLowerCase();
  if (number.includes("*") || /signature/.test(name)) return "signature";
  if (/showcase/.test(rarity) || /overnumbered|alternate art/.test(name)) return "showcase";
  if (/epic/.test(rarity)) return "epic";
  if (/uncommon/.test(rarity)) return "uncommon";
  if (/common/.test(rarity)) return "common";
  if (/rare/.test(rarity)) return "rare";
  return "other";
}

function classifyGundam(card: EvCard): string {
  const rarity = (card.rarity || "").toLowerCase().replace(/\s+/g, "");
  if (rarity.includes("lr")) return "lr";
  if (/legend/.test(rarity)) return "legend";
  if (rarity === "r+" || rarity.includes("r+")) return "r-plus";
  if (rarity === "u+" || rarity.includes("u+")) return "u-plus";
  if (rarity === "c+" || rarity.includes("c+")) return "c-plus";
  if (/uncommon/.test(rarity) || rarity === "u") return "uncommon";
  if (/common/.test(rarity) || rarity === "c") return "common";
  if (/rare/.test(rarity) || rarity === "r") return "rare";
  return "other";
}

function usablePrice(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function modelBoxEv(input: {
  cards: readonly EvCard[];
  slots: readonly RaritySlot[];
  packsPerBox: number;
  classify: (card: EvCard) => string;
}): BoxEvModel {
  const packs = Number.isFinite(input.packsPerBox) && input.packsPerBox > 0 ? input.packsPerBox : 0;
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
    const hitsPerBox = hitsPerPack * packs;
    const averagePrice = priced.length
      ? priced.reduce((sum, card) => sum + (card.marketPrice as number), 0) / priced.length
      : null;
    const slotEv = averagePrice === null ? 0 : averagePrice * hitsPerBox;
    modeledEv += slotEv;
    return {
      id: slot.id,
      label: slot.label,
      hitsPerPack,
      hitsPerBox,
      cardCount: list.length,
      pricedCount: priced.length,
      averagePrice,
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
