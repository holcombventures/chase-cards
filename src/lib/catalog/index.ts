/**
 * Catalog adapter registry — ChaseApp / API routes select by CategoryId.
 */

import type { CategoryId } from "./types";
import { isLiveCategory } from "./types";
import * as pokemon from "./pokemon";
import * as onePiece from "./one-piece";

export type CatalogAdapterId = "pokemon" | "one-piece";

/** Adapter exists but category status is still coming_soon. Not an upstream failure. */
export class CatalogNotLiveError extends Error {
  readonly status = 404;
  constructor(id: string) {
    super(`Catalog for ${id} is not live yet.`);
    this.name = "CatalogNotLiveError";
  }
}

export function hasCatalogAdapter(id: CategoryId): id is CatalogAdapterId {
  return id === "pokemon" || id === "one-piece";
}

export function assertLiveCatalog(id: CategoryId): CatalogAdapterId {
  if (!isLiveCategory(id) || !hasCatalogAdapter(id)) {
    throw new CatalogNotLiveError(id);
  }
  return id;
}

export const adapters = {
  pokemon,
  "one-piece": onePiece,
} as const;

export function getCatalogAdapter(id: CatalogAdapterId) {
  return adapters[id];
}

export {
  CATEGORIES,
  DEFAULT_CATEGORY_ID,
  ADDON_CATEGORY_IDS,
  LIVE_CATALOG_IDS,
  getCategory,
  isLiveCategory,
  isCategoryId,
  type CategoryId,
  type CategoryConfig,
  type CategoryStatus,
} from "./types";
