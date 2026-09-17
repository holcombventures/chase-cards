/**
 * Multi-category catalog config.
 * Pokémon + One Piece English are live; MTG / Sports remain coming soon.
 */

export type CategoryId = "pokemon" | "one-piece" | "mtg" | "sports";

export type CategoryStatus = "live" | "coming_soon";

export type CategoryConfig = {
  id: CategoryId;
  label: string;
  /** Short label for compact switcher chips */
  shortLabel: string;
  /** Add-on price display (Pokémon has no add-on) */
  priceLabel: string | null;
  status: CategoryStatus;
};

export const CATEGORIES: readonly CategoryConfig[] = [
  {
    id: "pokemon",
    label: "Pokémon",
    shortLabel: "Pokémon",
    priceLabel: null,
    status: "live",
  },
  {
    id: "one-piece",
    label: "One Piece English",
    shortLabel: "One Piece",
    priceLabel: "$1.99",
    status: "live",
  },
  {
    id: "mtg",
    label: "Magic: The Gathering",
    shortLabel: "MTG",
    priceLabel: "$1.99",
    status: "coming_soon",
  },
  {
    id: "sports",
    label: "Sports",
    shortLabel: "Sports",
    priceLabel: "$1.99",
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
