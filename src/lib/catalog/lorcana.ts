/**
 * Disney Lorcana catalog adapter.
 *
 * Upstream: TCGCSV (https://tcgcsv.com), a keyless daily mirror of TCGplayer.
 * Lorcana is TCGplayer category 71. Server-side only (the host does not send
 * CORS headers). Data refreshes about once a day, so callers keep a 24h price
 * snapshot and this module spaces requests and sends a custom User-Agent.
 *
 * Singles are products with a Number extended-data field. Sealed products and
 * inserts are dropped. Prices join on productId; marketPrice is the only
 * figure used. Normal and Cold Foil are subtypes of one product. A separate
 * "(Foil)" product that shares the collector number is merged onto that card
 * and the higher market price wins.
 *
 * Main numbered sets only. Promo groups (D23, DLPC, D100) and Illumineer's
 * Quest are omitted. Groups with no singles (upcoming sealed-only lists) are
 * omitted. There is no price-history archive, so month-over-month is N/A.
 *
 * Lorcana stays free. Ravensburger's fan-content policy does not allow
 * charging for access to Lorcana content.
 */

import type { PokemonCard, PokemonSet } from "@/lib/types";
import {
  LorcanaApiError,
  buildTcgcsvCards,
  createTcgcsvAdapter,
  displayCardName,
  extendedValue,
  isFoilSkuName,
  isReleasedGroup,
  productIsSingle,
  selectTcgcsvGroups,
  tcgplayerImageUrls,
  type ParsedCollectorNumber,
  type TcgcsvFetchMeta,
  type TcgcsvGroup,
  type TcgcsvPriceRow,
  type TcgcsvProduct,
} from "./tcgcsv";

export const categoryId = "lorcana" as const;

export const TCGCSV_BASE = "https://tcgcsv.com";
export const TCGCSV_CATEGORY_ID = 71;

export const USER_AGENT =
  "ChaseCards/1.0 (Disney Lorcana fan catalog; +https://chasecards.online)";

export type LorcanaPriceBackend = "tcgcsv";
export type LorcanaFetchMeta = TcgcsvFetchMeta;

export { LorcanaApiError };
export { LorcanaApiError as CatalogApiError };

export type { TcgcsvGroup, TcgcsvPriceRow, TcgcsvProduct };

/** Main sets use a numeric abbreviation (1, 2, … 13). Promos and quests do not. */
export function isMainNumberedGroup(group: TcgcsvGroup): boolean {
  return /^\d+$/.test((group.abbreviation || "").trim());
}

export { isReleasedGroup, productIsSingle, displayCardName, isFoilSkuName, extendedValue, tcgplayerImageUrls };

export function parseCollectorNumber(raw: string): ParsedCollectorNumber | null {
  const text = raw.trim();
  const slashed = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashed) {
    const printedTotal = parseInt(slashed[2], 10);
    if (!Number.isFinite(printedTotal) || printedTotal <= 0) return null;
    return { number: slashed[1], printedTotal };
  }
  const plain = text.match(/^(\d+)$/);
  if (plain) return { number: plain[1], printedTotal: 0 };
  return null;
}

export function selectLorcanaGroups(
  groups: readonly TcgcsvGroup[],
  options?: {
    now?: Date;
    /**
     * When provided, a group is kept only when this map says it has singles.
     * Upcoming sealed-only groups (no Number field) are dropped.
     */
    singlesByGroupId?: ReadonlyMap<number, boolean>;
  },
): TcgcsvGroup[] {
  return selectTcgcsvGroups(groups, {
    now: options?.now,
    isMainGroup: isMainNumberedGroup,
    requireReleased: true,
    availabilityByGroupId: options?.singlesByGroupId,
  });
}

function seriesForGroup(group: TcgcsvGroup): string {
  const abbreviation = (group.abbreviation || "").trim();
  return abbreviation ? `Set ${abbreviation}` : "Disney Lorcana";
}

export function groupToSet(group: TcgcsvGroup): PokemonSet {
  const abbreviation = (group.abbreviation || "").trim();
  const release = (group.publishedOn || "").trim().slice(0, 10);
  return {
    id: String(group.groupId),
    name: (group.name || "").trim(),
    series: abbreviation ? `Set ${abbreviation}` : "Disney Lorcana",
    printedTotal: 0,
    total: 0,
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(release) ? release : "",
  };
}

export function sortLorcanaSets(sets: readonly PokemonSet[]): PokemonSet[] {
  return [...sets].sort((a, b) => {
    const byDate = (b.releaseDate || "").localeCompare(a.releaseDate || "");
    if (byDate !== 0) return byDate;
    return (a.name || "").localeCompare(b.name || "");
  });
}

const adapter = createTcgcsvAdapter({
  categoryId,
  tcgcsvCategoryId: TCGCSV_CATEGORY_ID,
  userAgent: USER_AGENT,
  errorLabel: "Lorcana",
  createError: (message, status) => new LorcanaApiError(message, status),
  isMainGroup: isMainNumberedGroup,
  parseCollectorNumber,
  seriesForGroup,
  requireReleased: true,
  requirePricedSingles: false,
  mergeFoilSkus: true,
  distinguishByRarity: false,
  labelParallelRarity: false,
});

export function buildLorcanaCards(input: {
  group: TcgcsvGroup;
  products: readonly TcgcsvProduct[];
  prices: readonly TcgcsvPriceRow[];
}): PokemonCard[] {
  return buildTcgcsvCards(input, {
    categoryId,
    parseCollectorNumber,
    mergeFoilSkus: true,
    distinguishByRarity: false,
    labelParallelRarity: false,
  });
}

export const fetchSets = adapter.fetchSets;
export const fetchCards = adapter.fetchCards;

/** Test helper — drop the in-process group/set cache. */
export function resetLorcanaCacheForTests(): void {
  adapter.resetCache();
}
