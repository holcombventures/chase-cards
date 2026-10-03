/**
 * Riftbound catalog adapter.
 *
 * Upstream: TCGCSV category 89. Same etiquette as Lorcana: server-side only,
 * custom User-Agent, paced requests, 24h price snapshot, month-over-month N/A.
 *
 * Main sets are an allow-list. Promos, bundles, Proving Grounds, and Secret
 * Garden stay out. Radiance and Legacy are on the list but hidden until they
 * have priced singles.
 *
 * Riftbound stays free. Riot's fan-content policy does not allow a paywall.
 */

import type { PokemonCard } from "@/lib/types";
import {
  buildTcgcsvCards,
  createTcgcsvAdapter,
  selectTcgcsvGroups,
  type ParsedCollectorNumber,
  type TcgcsvGroup,
  type TcgcsvPriceRow,
  type TcgcsvProduct,
} from "./tcgcsv";

export const categoryId = "riftbound" as const;

export const TCGCSV_CATEGORY_ID = 89;

export const USER_AGENT =
  "ChaseCards/1.0 (Riftbound fan catalog; +https://chasecards.online)";

/**
 * Origins, Spiritforged, Unleashed, Vendetta, plus Radiance and Legacy.
 * New main sets are added here on purpose so promo groups cannot slip in.
 */
export const RIFTBOUND_MAIN_GROUP_IDS: ReadonlySet<number> = new Set([
  24344, // Origins
  24519, // Spiritforged
  24560, // Unleashed
  24698, // Vendetta
  24819, // Radiance
  24832, // Legacy
]);

export function isMainRiftboundGroup(group: TcgcsvGroup): boolean {
  return RIFTBOUND_MAIN_GROUP_IDS.has(group.groupId);
}

/**
 * Accepts 123/166, 021a/166 alt arts, 189/166 overnumbered, 189* /166
 * Signatures, SP1/006, rune codes (R04, R04a), and double-faced tokens
 * (T05 // T06). The display number keeps the suffix that distinguishes them.
 */
export function parseRiftboundCollectorNumber(raw: string): ParsedCollectorNumber | null {
  const text = raw.trim().replace(/\s+/g, " ");
  const slashed = text.match(/^([A-Za-z]*)(\d+)([A-Za-z]*)(\*?)\s*\/\s*(\d+)$/);
  if (slashed) {
    const printedTotal = parseInt(slashed[5], 10);
    if (!Number.isFinite(printedTotal) || printedTotal <= 0) return null;
    return {
      number: `${slashed[1]}${slashed[2]}${slashed[3]}${slashed[4]}`,
      printedTotal,
    };
  }
  const token = text.match(
    /^([A-Za-z]+\d+[A-Za-z]*)(?:\s*\/\/\s*([A-Za-z]+\d+[A-Za-z]*))?$/,
  );
  if (!token) return null;
  const number = token[2] ? `${token[1]} // ${token[2]}` : token[1];
  return { number, printedTotal: 0 };
}

export function selectRiftboundGroups(
  groups: readonly TcgcsvGroup[],
  options?: {
    now?: Date;
    /** True when the group has enough priced singles. */
    availabilityByGroupId?: ReadonlyMap<number, boolean>;
  },
): TcgcsvGroup[] {
  return selectTcgcsvGroups(groups, {
    now: options?.now,
    isMainGroup: isMainRiftboundGroup,
    requireReleased: false,
    availabilityByGroupId: options?.availabilityByGroupId,
  });
}

const adapter = createTcgcsvAdapter({
  categoryId,
  tcgcsvCategoryId: TCGCSV_CATEGORY_ID,
  userAgent: USER_AGENT,
  errorLabel: "Riftbound",
  isMainGroup: isMainRiftboundGroup,
  parseCollectorNumber: parseRiftboundCollectorNumber,
  seriesForGroup: (group) => (group.abbreviation || "").trim() || "Riftbound",
  requireReleased: false,
  requirePricedSingles: true,
  mergeFoilSkus: true,
  distinguishByRarity: false,
  labelParallelRarity: false,
});

export function buildRiftboundCards(input: {
  group: TcgcsvGroup;
  products: readonly TcgcsvProduct[];
  prices: readonly TcgcsvPriceRow[];
}): PokemonCard[] {
  return buildTcgcsvCards(input, {
    categoryId,
    parseCollectorNumber: parseRiftboundCollectorNumber,
    mergeFoilSkus: true,
    distinguishByRarity: false,
    labelParallelRarity: false,
  });
}

export const fetchSets = adapter.fetchSets;
export const fetchCards = adapter.fetchCards;

export function resetRiftboundCacheForTests(): void {
  adapter.resetCache();
}
