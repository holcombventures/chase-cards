/**
 * Which sealed product a Box EV result is about.
 * Types, pack counts, and special-set rules live in sealed-products.json.
 * A set's selector is the TCGCSV products that match those types.
 */

import { sealedMarketPrice, type SealedPriceRow, type SealedProduct } from "@/lib/catalog/sealedBox";
import type { ToolCategoryId } from "./categories";
import catalogJson from "./sealed-products.json";

export type SealedBonus = { slotId: string; hits: number };

export type SealedOffer = {
  productId: number;
  name: string;
  typeId: string;
  typeLabel: string;
  marketPrice: number | null;
  packs: number;
  cardsPerPack: number | null;
  evApplies: boolean;
  accessories: boolean;
  promo: boolean;
  rateTable: string;
  bonus: SealedBonus[];
  note: string | null;
};

type ProductRule = {
  id: string;
  label: string;
  packs: number;
  ev: "packs" | "fixed";
  accessories: boolean;
  promo: boolean;
  match: string;
  reject?: string[];
};

type GameRules = {
  specialSetNames: string[];
  hideOnSpecial: string[];
  prefer: string[];
  preferOnSpecial: string[];
  products: ProductRule[];
};

type OverrideRule = {
  game: ToolCategoryId;
  setIdPrefix: string;
  setNameIncludes: string;
  productId: string;
  packs: number;
  cardsPerPack: number | null;
  rateTable: string;
  bonus?: SealedBonus[];
  note: string | null;
};

const games = catalogJson.games as Record<ToolCategoryId, GameRules>;
const overrides = catalogJson.overrides as OverrideRule[];

export const FIXED_PRODUCT_NOTE = "EV not applicable: fixed or mixed contents";

function normalize(value: string): string {
  return value.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();
}

function hasCollectorNumber(product: SealedProduct): boolean {
  for (const row of product.extendedData || []) {
    if ((row.name || "").trim().toLowerCase() !== "number") continue;
    if ((row.value || "").trim()) return true;
  }
  return false;
}

function isCardLike(product: SealedProduct): boolean {
  for (const row of product.extendedData || []) {
    const name = (row.name || "").trim().toLowerCase();
    if (name !== "rarity" && name !== "cardtype" && name !== "card type") continue;
    const value = (row.value || "").trim().toLowerCase();
    if (value && value !== "code card") return true;
  }
  return false;
}

/** Drop wholesale cases, code cards, and non-English sealed SKUs. */
export function dropSealedName(name: string): boolean {
  const text = normalize(name);
  if (!text) return true;
  if (/\bcode card\b/.test(text)) return true;
  if (/\b(japanese|japan|korean|chinese|simplified|traditional|thai)\b/.test(text)) return true;
  if (/\bcase\b/.test(text)) return true;
  if (/\bdisplay\b/.test(text) && !/\bbooster display\b/.test(text)) return true;
  if (text.startsWith("don!!")) return true;
  return false;
}

export function isSpecialPokemonSet(set: { id?: string | null; name?: string | null }): boolean {
  const name = normalize(set.name || "");
  const rules = games.pokemon;
  return rules.specialSetNames.some((token) => name.includes(token));
}

function ruleForName(category: ToolCategoryId, name: string): ProductRule | null {
  const text = normalize(name);
  for (const rule of games[category].products) {
    if (!text.includes(rule.match)) continue;
    if ((rule.reject || []).some((token) => text.includes(token))) continue;
    return rule;
  }
  return null;
}

function overrideFor(
  category: ToolCategoryId,
  set: { id?: string | null; name?: string | null },
  typeId: string,
): OverrideRule | null {
  const setId = (set.id || "").toUpperCase();
  const setName = normalize(set.name || "");
  for (const rule of overrides) {
    if (rule.game !== category || rule.productId !== typeId) continue;
    const idOk = rule.setIdPrefix ? setId.startsWith(rule.setIdPrefix.toUpperCase()) : false;
    const nameOk = rule.setNameIncludes ? setName.includes(rule.setNameIncludes) : false;
    if (idOk || nameOk) return rule;
  }
  return null;
}

export function buildSealedOffers(
  products: readonly SealedProduct[],
  prices: readonly SealedPriceRow[],
  set: { category: ToolCategoryId; id?: string | null; name?: string | null },
): SealedOffer[] {
  const pricesByProduct = new Map<number, SealedPriceRow[]>();
  for (const row of prices) {
    if (!Number.isFinite(row.productId)) continue;
    const list = pricesByProduct.get(row.productId);
    if (list) list.push(row);
    else pricesByProduct.set(row.productId, [row]);
  }

  const special = set.category === "pokemon" && isSpecialPokemonSet(set);
  const hidden = new Set(special ? games.pokemon.hideOnSpecial : []);
  const offers: SealedOffer[] = [];

  for (const product of products) {
    if (!product || !Number.isFinite(product.productId)) continue;
    if (hasCollectorNumber(product) || isCardLike(product)) continue;
    const name = (product.name || "").trim();
    if (!name || dropSealedName(name)) continue;
    const rule = ruleForName(set.category, name);
    if (rule && hidden.has(rule.id)) continue;
    const override = rule ? overrideFor(set.category, set, rule.id) : null;
    const evApplies = rule?.ev === "packs";
    offers.push({
      productId: product.productId,
      name,
      typeId: rule?.id ?? "fixed",
      typeLabel: rule?.label ?? "Fixed or mixed",
      marketPrice: sealedMarketPrice(pricesByProduct.get(product.productId) || []),
      packs: override?.packs ?? rule?.packs ?? 0,
      cardsPerPack: override?.cardsPerPack ?? null,
      evApplies,
      accessories: rule?.accessories === true,
      promo: rule?.promo === true,
      rateTable: override?.rateTable ?? "standard",
      bonus: evApplies ? (override?.bonus ?? []).map((hit) => ({ ...hit })) : [],
      note: override?.note ?? (evApplies ? null : FIXED_PRODUCT_NOTE),
    });
  }

  return offers.sort((a, b) => a.name.localeCompare(b.name));
}

function cheapest(offers: readonly SealedOffer[]): SealedOffer | null {
  let best: SealedOffer | null = null;
  for (const offer of offers) {
    if (offer.marketPrice === null) {
      if (!best) best = offer;
      continue;
    }
    if (!best || best.marketPrice === null || offer.marketPrice < best.marketPrice) best = offer;
  }
  return best;
}

/** The product the selector starts on. Special sets prefer a bundle, then an ETB. */
export function pickDefaultOffer(
  offers: readonly SealedOffer[],
  set: { category: ToolCategoryId; id?: string | null; name?: string | null },
): SealedOffer | null {
  if (!offers.length) return null;
  const applicable = offers.filter((offer) => offer.evApplies);
  const pool = applicable.length ? applicable : offers;
  const special = set.category === "pokemon" && isSpecialPokemonSet(set);
  const prefer = special ? games.pokemon.preferOnSpecial : games[set.category].prefer;
  for (const typeId of prefer) {
    const match = cheapest(pool.filter((offer) => offer.typeId === typeId));
    if (match) return match;
  }
  return cheapest(pool);
}

export function visibleOffers(offers: readonly SealedOffer[]): SealedOffer[] {
  const applicable = offers.filter((offer) => offer.evApplies);
  return applicable.length ? applicable : offers.slice();
}

export function omittedFixedCount(offers: readonly SealedOffer[]): number {
  const applicable = offers.some((offer) => offer.evApplies);
  if (!applicable) return 0;
  return offers.filter((offer) => !offer.evApplies).length;
}

export function offerChoiceLabel(offer: SealedOffer, siblings: readonly SealedOffer[]): string {
  const sameType = siblings.filter((item) => item.typeId === offer.typeId).length;
  if (sameType <= 1) return offer.typeLabel;
  return offer.name;
}

export function productResultTitle(
  setName: string,
  offer: Pick<SealedOffer, "name" | "typeLabel" | "packs">,
  packs: number,
  multiplier: number,
): string {
  const set = setName.trim();
  let distinct = offer.name.trim().replace(/^(disney lorcana:|gundam card game)\s*/i, "");
  if (set && distinct.toLowerCase().includes(set.toLowerCase())) {
    const escaped = set.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = distinct
      .replace(new RegExp(escaped, "i"), "")
      .replace(/^[\s:—–-]+/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (stripped && stripped.toLowerCase().includes(offer.typeLabel.toLowerCase())) {
      distinct = stripped;
    }
  }
  distinct = distinct.replace(/^[\s:—–-]+/, "").replace(/\s+/g, " ").trim();
  if (!distinct) distinct = offer.typeLabel;
  const count = Number.isFinite(packs) && packs > 0 ? Math.round(packs) : 0;
  const packText = count > 0 ? ` (${count} pack${count === 1 ? "" : "s"})` : "";
  const times = multiplier > 1 ? ` × ${multiplier}` : "";
  return `${set || offer.typeLabel} · ${distinct}${packText}${times}`;
}

export function promoMarketFromCards(
  cards: readonly { name?: string | null; marketPrice: number | null }[],
  productName: string,
): number | null {
  const bracket = productName.match(/\[([^\]]+)\]/);
  if (!bracket) return null;
  const token = bracket[1].replace(/\bex\b/gi, "").trim().toLowerCase();
  if (token.length < 3) return null;
  const prices = cards
    .filter((card) => (card.name || "").toLowerCase().includes(token))
    .map((card) => card.marketPrice)
    .filter((price): price is number => typeof price === "number" && price >= 0);
  if (!prices.length) return null;
  const sorted = [...prices].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
