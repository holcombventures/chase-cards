import type { CategoryId } from "@/lib/catalog/types";
import type {
  CardWithPrice,
  CardsMetaPriceSource,
  SetStats,
} from "@/lib/types";

/** Last known cards + meta for a category/set — in-memory for this tab session. */
export type CachedSetPayload = {
  cards: CardWithPrice[];
  pricedCount: number;
  priceSource: CardsMetaPriceSource | null;
  fallbackUsed: boolean;
  stats: SetStats | null;
};

const setCache = new Map<string, CachedSetPayload>();

export function cardSetCacheKey(categoryId: CategoryId, setId: string): string {
  return `${categoryId}:${setId}`;
}

export function getCachedSet(
  categoryId: CategoryId,
  setId: string,
): CachedSetPayload | undefined {
  if (!setId) return undefined;
  return setCache.get(cardSetCacheKey(categoryId, setId));
}

export function setCachedSet(
  categoryId: CategoryId,
  setId: string,
  payload: CachedSetPayload,
): void {
  if (!setId) return;
  setCache.set(cardSetCacheKey(categoryId, setId), payload);
}

/** Warm browser HTTP cache for chase / visible tile art. */
export function warmCardImages(
  cards: CardWithPrice[],
  limit = 24,
): void {
  if (typeof window === "undefined") return;
  const n = Math.min(limit, cards.length);
  for (let i = 0; i < n; i++) {
    const url = cards[i]?.images?.large || cards[i]?.images?.small;
    if (!url) continue;
    try {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
    } catch {
      // ignore
    }
  }
}
