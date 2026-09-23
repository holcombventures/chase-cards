import type { CardsMetaPriceSource, SetStats } from "./types";
import type { CatalogCard } from "./cardCacheModel";
import { isCatalogCard, slimCardWithPrices } from "./cardCacheModel";

const STORAGE_KEY = "chase-cards-set-cache-v1";
export const SET_CARD_CACHE_LIMIT = 8;

export type CachedSetSnapshot = {
  categoryId: string;
  setId: string;
  cards: CatalogCard[];
  pricedCount: number;
  priceSource: CardsMetaPriceSource | null;
  fallbackUsed: boolean;
  stats: SetStats | null;
  cachedAt: number;
  /** 0 until a price payload has been merged. */
  pricesAt: number;
  /** ISO time from the price snapshot. Absent on older session entries. */
  pricesAsOf?: string | null;
};

const memory = new Map<string, CachedSetSnapshot>();
let hydrated = false;

function cacheKey(categoryId: string, setId: string): string {
  return `${categoryId}:${setId}`;
}

function hydrateFromSession(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as CachedSetSnapshot[];
    if (!Array.isArray(parsed)) return;
    for (const entry of parsed) {
      if (!entry?.categoryId || !entry?.setId || !Array.isArray(entry.cards)) {
        continue;
      }
      memory.set(cacheKey(entry.categoryId, entry.setId), entry);
    }
  } catch {
    // Private mode or corrupt storage — memory cache still works.
  }
}

function persistSession(): void {
  if (typeof window === "undefined") return;
  try {
    const list = [...memory.values()].slice(-SET_CARD_CACHE_LIMIT);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore quota failures; the in-memory map still serves this tab.
    }
  }
}

export function readSetCardCache(
  categoryId: string,
  setId: string,
): CachedSetSnapshot | null {
  hydrateFromSession();
  if (!categoryId || !setId) return null;
  const key = cacheKey(categoryId, setId);
  const hit = memory.get(key);
  if (!hit) return null;
  if (!hit.cards.every((card) => isCatalogCard(card))) {
    memory.delete(key);
    persistSession();
    return null;
  }
  memory.delete(key);
  memory.set(cacheKey(categoryId, setId), hit);
  return hit;
}

/** Test helper. */
export function resetSetCardCacheForTests(): void {
  memory.clear();
  hydrated = false;
}

export function writeSetCardCache(snapshot: CachedSetSnapshot): void {
  hydrateFromSession();
  const key = cacheKey(snapshot.categoryId, snapshot.setId);
  const cards = snapshot.cards.map(slimCardWithPrices).filter(isCatalogCard);
  if (cards.length === 0 && snapshot.cards.length > 0) return;
  memory.delete(key);
  memory.set(key, {
    ...snapshot,
    cards,
  });
  while (memory.size > SET_CARD_CACHE_LIMIT) {
    const oldest = memory.keys().next().value;
    if (oldest === undefined) break;
    memory.delete(oldest);
  }
  persistSession();
}
