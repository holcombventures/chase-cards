/**
 * Gundam Card Game catalog adapter.
 *
 * Upstream: TCGCSV category 86. Same etiquette as Lorcana: server-side only,
 * custom User-Agent, paced requests, 24h price snapshot, month-over-month N/A.
 * Images are TCGplayer CDN urls.
 *
 * Main sets are booster sets (GDxx) and starter decks (STxx). Promos, deck
 * build boxes, and extra boosters are omitted. A set is listed only when it
 * has priced singles, so sealed previews stay hidden.
 *
 * Parallels share a collector number and stay separate, labeled by rarity.
 * Reprints keep the number of the set they came from (ST01-011, EXR-009).
 *
 * Gundam stays free. This is unofficial fan content.
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

export const categoryId = "gundam" as const;

export const TCGCSV_CATEGORY_ID = 86;

export const USER_AGENT =
  "ChaseCards/1.0 (Gundam Card Game fan catalog; +https://chasecards.online)";

/** Booster sets GD01… and starter decks ST01…. Not promos or deck boxes. */
export function isMainGundamGroup(group: TcgcsvGroup): boolean {
  return /^(GD|ST)\d+$/i.test((group.abbreviation || "").trim());
}

export function isGundamBoosterGroup(group: TcgcsvGroup): boolean {
  return /^GD\d+$/i.test((group.abbreviation || "").trim());
}

/**
 * GD05-001, ST11-001, reprints such as ST01-011, EX Resource EXR-009,
 * tokens T-026, and resources R-001. The display number keeps the code so
 * a reprint is not shown as a plain integer.
 */
export function parseGundamCollectorNumber(raw: string): ParsedCollectorNumber | null {
  const text = raw.trim();
  const match = text.match(/^([A-Za-z]+\d*)-(\d+)$/);
  if (!match) return null;
  const suffix = parseInt(match[2], 10);
  if (!Number.isFinite(suffix)) return null;
  return { number: text, printedTotal: 0 };
}

export function selectGundamGroups(
  groups: readonly TcgcsvGroup[],
  options?: {
    now?: Date;
    /** True when the group has enough priced singles. */
    availabilityByGroupId?: ReadonlyMap<number, boolean>;
  },
): TcgcsvGroup[] {
  return selectTcgcsvGroups(groups, {
    now: options?.now,
    isMainGroup: isMainGundamGroup,
    requireReleased: false,
    availabilityByGroupId: options?.availabilityByGroupId,
  });
}

const adapter = createTcgcsvAdapter({
  categoryId,
  tcgcsvCategoryId: TCGCSV_CATEGORY_ID,
  userAgent: USER_AGENT,
  errorLabel: "Gundam Card Game",
  isMainGroup: isMainGundamGroup,
  parseCollectorNumber: parseGundamCollectorNumber,
  seriesForGroup: (group) => (group.abbreviation || "").trim() || "Gundam",
  requireReleased: false,
  requirePricedSingles: true,
  mergeFoilSkus: true,
  distinguishByRarity: true,
  labelParallelRarity: true,
});

export function buildGundamCards(input: {
  group: TcgcsvGroup;
  products: readonly TcgcsvProduct[];
  prices: readonly TcgcsvPriceRow[];
}): PokemonCard[] {
  return buildTcgcsvCards(input, {
    categoryId,
    parseCollectorNumber: parseGundamCollectorNumber,
    mergeFoilSkus: true,
    distinguishByRarity: true,
    labelParallelRarity: true,
  });
}

export const fetchSets = adapter.fetchSets;
export const fetchCards = adapter.fetchCards;

export function resetGundamCacheForTests(): void {
  adapter.resetCache();
}
