/**
 * Multi-category catalog config.
 * Pokémon, One Piece English, and Magic: The Gathering English are live paid
 * catalogs (OP uses public optcgapi.com without a key; MTG uses public Scryfall).
 * Disney Lorcana is live and free — fan content, never a Premium or add-on.
 * Sports stays coming_soon — no adapter.
 */

import { ADDON_PRICE_LABEL } from "@/lib/planPrices";

export type CategoryId =
  | "pokemon"
  | "one-piece"
  | "mtg"
  | "lorcana"
  | "sports";

export type CategoryStatus = "live" | "coming_soon";

export type CategoryConfig = {
  id: CategoryId;
  label: string;
  /** Short label for compact switcher chips */
  shortLabel: string;
  /** Add-on price display (same expansion-pack price for every paid category). */
  priceLabel: string | null;
  status: CategoryStatus;
  /**
   * Full catalog with no paywall. Lorcana must stay free: Ravensburger's
   * fan-content policy does not allow charging for Lorcana content.
   */
  free?: boolean;
};

export const CATEGORIES: readonly CategoryConfig[] = [
  {
    id: "pokemon",
    label: "Pokémon",
    shortLabel: "Pokémon",
    /** Shown when Pokémon is offered as an add-on (Premium chose another live cat). */
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
    status: "live",
  },
  {
    id: "lorcana",
    label: "Disney Lorcana",
    shortLabel: "Lorcana",
    priceLabel: null,
    status: "live",
    free: true,
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

/** Visible on Lorcana pages. Not an affiliation or a paid upsell. */
export const LORCANA_FAN_NOTE =
  "Unofficial fan content. Not affiliated with Disney or Ravensburger. Prices via TCGplayer.";

export function isFreeCategory(id: CategoryId): boolean {
  return getCategory(id).free === true;
}

/** Live categories that can be chosen or sold. Lorcana is excluded. */
export function isPaidLiveCategory(id: CategoryId): boolean {
  const category = getCategory(id);
  return category.status === "live" && category.free !== true;
}

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

/**
 * Live categories Premium / add-ons / All Access may sell.
 * Same set as the pre-Lorcana live catalogs.
 */
export const PAID_LIVE_CATALOG_IDS: readonly CategoryId[] = CATEGORIES.filter(
  (c) => c.status === "live" && c.free !== true,
).map((c) => c.id);
