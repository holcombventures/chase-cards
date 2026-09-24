/**
 * Multi-category catalog config.
 * Pokémon and One Piece English are live (OP uses public optcgapi.com without a key).
 * MTG / Sports stay Coming Soon — no adapter yet.
 */

import { ADDON_PRICE_LABEL } from "@/lib/planPrices";

export type CategoryId = "pokemon" | "one-piece" | "mtg" | "sports";

export type CategoryStatus = "live" | "coming_soon";

export type CategoryConfig = {
  id: CategoryId;
  label: string;
  /** Short label for compact switcher chips */
  shortLabel: string;
  /** Add-on price display (same $1.99 expansion-pack price for every category). */
  priceLabel: string | null;
  status: CategoryStatus;
};

export const CATEGORIES: readonly CategoryConfig[] = [
  {
    id: "pokemon",
    label: "Pokémon",
    shortLabel: "Pokémon",
    /** Shown when Pokémon is offered as a $1.99 add-on (Premium chose another live cat). */
    priceLabel: ADDON_PRICE_LABEL,
    status: "live",
  },
  {
    id: "one-piece",
    label: "One Piece English",
    shortLabel: "One Piece",
    priceLabel: ADDON_PRICE_LABEL,
    // Public optcgapi.com fallback serves sets, prices, and art without OPTCG_API_KEY.
    status: "live",
  },
  {
    id: "mtg",
    label: "Magic: The Gathering",
    shortLabel: "MTG",
    priceLabel: ADDON_PRICE_LABEL,
    status: "coming_soon",
  },
  {
    id: "sports",
    label: "Sports",
    shortLabel: "Sports",
    priceLabel: ADDON_PRICE_LABEL,
    status: "coming_soon",
  },
] as const;

export const DEFAULT_CATEGORY_ID: CategoryId = "pokemon";

export const ADDON_CATEGORY_IDS: readonly CategoryId[] = [
  "one-piece",
  "mtg",
  "sports",
] as const;

export function getCategory(id: CategoryId): CategoryConfig {
  const found = CATEGORIES.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Unknown category: ${id}`);
  }
  return found;
}

export function isLiveCategory(id: CategoryId): boolean {
  return getCategory(id).status === "live";
}

export function isCategoryId(value: string): value is CategoryId {
  return CATEGORIES.some((c) => c.id === value);
}

/** Live categories that ship a catalog adapter today. */
export const LIVE_CATALOG_IDS: readonly CategoryId[] = CATEGORIES.filter(
  (c) => c.status === "live",
).map((c) => c.id);
