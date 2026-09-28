import {
  applyPricePatches,
  normalizePricePatches,
  toPricesBody,
  type CardPricePatch,
  type CardsApiBody,
  type CardsApiMeta,
} from "./cardCacheModel";

/**
 * Shared price snapshot TTL for Pokémon, One Piece, and MTG.
 * Art/catalog caching stays on its longer cadence (process memory + CDN).
 * Lorcana uses 24h because TCGCSV refreshes about once a day.
 */
export const PRICE_SNAPSHOT_TTL_MS = 4 * 60 * 60 * 1000;
export const LORCANA_PRICE_SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;

export function priceSnapshotTtlMs(category: string): number {
  if (category === "lorcana") return LORCANA_PRICE_SNAPSHOT_TTL_MS;
  return PRICE_SNAPSHOT_TTL_MS;
}

export const PRICE_SNAPSHOT_STORE = "price-snapshots";

export type PriceCacheState = "hit" | "miss" | "memory";

export type PriceSnapshot = {
  v: 1;
  category: string;
  setId: string;
  /** When this snapshot was fetched from upstream. Shown to users. */
  pricesAsOf: string;
  /** Epoch ms used for the category TTL. Not a market timestamp. */
  storedAt: number;
  data: CardPricePatch[];
  meta: CardsApiMeta;
};

export function priceSnapshotKey(category: string, setId: string): string {
  return `${category}/${setId}`;
}

/** Inclusive window: a snapshot stored exactly 4h ago is still fresh. */
export function snapshotIsFresh(
  storedAt: number,
  now = Date.now(),
  ttl = PRICE_SNAPSHOT_TTL_MS,
): boolean {
  return Number.isFinite(storedAt) && now - storedAt <= ttl;
}

/**
 * Deploy previews and local dev can pass `?priceCache=refresh` to skip a
 * fresh snapshot. Production ignores it so visitors cannot force upstream.
 */
export function priceCacheRefreshAllowed(
  context = process.env.CONTEXT,
): boolean {
  return context !== "production";
}

export function buildPriceSnapshot(
  category: string,
  setId: string,
  body: CardsApiBody,
  now = Date.now(),
): PriceSnapshot {
  const prices = toPricesBody(body);
  const stamped =
    typeof body.meta?.pricesAsOf === "string" && body.meta.pricesAsOf
      ? body.meta.pricesAsOf
      : new Date(now).toISOString();
  return {
    v: 1,
    category,
    setId,
    pricesAsOf: stamped,
    storedAt: now,
    data: prices.data,
    meta: {
      ...prices.meta,
      pricesAsOf: stamped,
      part: "prices",
    },
  };
}

export function parsePriceSnapshot(raw: unknown): PriceSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const snap = raw as Partial<PriceSnapshot>;
  if (snap.v !== 1) return null;
  if (typeof snap.category !== "string" || typeof snap.setId !== "string") {
    return null;
  }
  if (typeof snap.pricesAsOf !== "string" || !snap.pricesAsOf) return null;
  if (typeof snap.storedAt !== "number" || !Number.isFinite(snap.storedAt)) {
    return null;
  }
  const data = normalizePricePatches(snap.data);
  if (!data) return null;
  const meta =
    snap.meta && typeof snap.meta === "object" ? snap.meta : ({} as CardsApiMeta);
  return {
    v: 1,
    category: snap.category,
    setId: snap.setId,
    pricesAsOf: snap.pricesAsOf,
    storedAt: snap.storedAt,
    data,
    meta: {
      ...meta,
      pricesAsOf: snap.pricesAsOf,
      part: "prices",
    },
  };
}

export function pricePayloadFromSnapshot(
  snap: PriceSnapshot,
  priceCache: PriceCacheState,
): { data: CardPricePatch[]; meta: CardsApiMeta } {
  return {
    data: snap.data,
    meta: {
      ...snap.meta,
      part: "prices",
      pricesAsOf: snap.pricesAsOf,
      priceCache,
    },
  };
}

/** Overlay a fresh price snapshot onto a cached catalog/full body. */
export function mergeFullBodyWithSnapshot(
  body: CardsApiBody,
  snap: PriceSnapshot,
): CardsApiBody {
  return {
    data: applyPricePatches(body.data || [], snap.data),
    meta: {
      ...body.meta,
      pricedCount: snap.meta.pricedCount,
      missingPriceCount: snap.meta.missingPriceCount,
      priceSource: snap.meta.priceSource,
      fallbackUsed: snap.meta.fallbackUsed,
      usedOptcgKey: snap.meta.usedOptcgKey,
      priceBackend: snap.meta.priceBackend,
      stats: snap.meta.stats ?? body.meta?.stats,
      releaseDate: snap.meta.releaseDate ?? body.meta?.releaseDate,
      pricesAsOf: snap.pricesAsOf,
      part: "full",
    },
  };
}
