import type {
  CardWithPrice,
  CardsMetaPriceSource,
  PriceSource,
  SetStats,
} from "./types";

/** Stable card identity + art. Prices are filled by a separate response. */
export type CatalogCard = CardWithPrice;

export type CardPricePatch = {
  id: string;
  marketPrice: number | null;
  priceVariant: string | null;
  priceUpdatedAt: string | null;
  priceSource: PriceSource | null;
};

export type CardsApiMeta = {
  category?: string;
  total?: number;
  pricedCount?: number;
  missingPriceCount?: number;
  priceSource?: CardsMetaPriceSource;
  fallbackUsed?: boolean;
  usedOptcgKey?: boolean;
  priceBackend?: string;
  releaseDate?: string | null;
  stats?: SetStats | null;
  catalogSource?: string;
  part?: "catalog" | "prices" | "full";
};

export type CardsApiBody = {
  data: CardWithPrice[];
  meta?: CardsApiMeta;
};

/** Browser may keep catalog JSON for an hour; Netlify CDN keeps it for a day. */
export const CATALOG_CACHE_CONTROL =
  "public, max-age=3600, stale-while-revalidate=86400";
export const CATALOG_CDN_CACHE_CONTROL =
  "public, s-maxage=86400, stale-while-revalidate=604800";

/**
 * Browser always revalidates prices. CDN may reuse a copy for 60s, then serve
 * it stale for another 60s while refreshing, so set switches stay cheap.
 */
export const PRICES_CACHE_CONTROL = "public, max-age=0, must-revalidate";
export const PRICES_CDN_CACHE_CONTROL =
  "public, s-maxage=60, stale-while-revalidate=60";

/** Legacy full payload mixes art identity with prices — do not CDN-cache it. */
export const FULL_CACHE_CONTROL = "private, no-store";

export const CATALOG_MEMORY_TTL_MS = 24 * 60 * 60 * 1000;
export const PRICE_MEMORY_TTL_MS = 60 * 1000;

export function cacheHeaders(
  part: "catalog" | "prices" | "full",
): Record<string, string> {
  if (part === "catalog") {
    return {
      "Cache-Control": CATALOG_CACHE_CONTROL,
      "Netlify-CDN-Cache-Control": CATALOG_CDN_CACHE_CONTROL,
    };
  }
  if (part === "prices") {
    return {
      "Cache-Control": PRICES_CACHE_CONTROL,
      "Netlify-CDN-Cache-Control": PRICES_CDN_CACHE_CONTROL,
    };
  }
  return { "Cache-Control": FULL_CACHE_CONTROL };
}

export function payloadCacheKey(parts: {
  category: string;
  setId: string;
  setName?: string | null;
  releaseDate?: string | null;
}): string {
  return [
    parts.category,
    parts.setId,
    parts.setName?.trim() || "",
    parts.releaseDate?.trim() || "",
  ].join("|");
}

export function pricesAreFresh(storedAt: number, now = Date.now()): boolean {
  return now - storedAt <= PRICE_MEMORY_TTL_MS;
}

export function catalogIsFresh(storedAt: number, now = Date.now()): boolean {
  return now - storedAt <= CATALOG_MEMORY_TTL_MS;
}

/** Drop bulky vendor blobs. Art URLs and identity stay; prices are cleared. */
export function slimCatalogCard(card: CardWithPrice): CatalogCard {
  return {
    id: card.id,
    name: card.name,
    number: card.number,
    rarity: card.rarity,
    images: {
      small: card.images?.small || "",
      large: card.images?.large || card.images?.small || "",
    },
    set: {
      id: card.set?.id ?? "",
      name: card.set?.name ?? "",
      printedTotal: card.set?.printedTotal ?? 0,
      total: card.set?.total ?? 0,
    },
    marketPrice: null,
    priceVariant: null,
    priceUpdatedAt: null,
    priceSource: null,
  };
}

/** Same slim shape, keeping the last known price fields for client revisit. */
export function slimCardWithPrices(card: CardWithPrice): CatalogCard {
  return {
    ...slimCatalogCard(card),
    marketPrice: card.marketPrice,
    priceVariant: card.priceVariant,
    priceUpdatedAt: card.priceUpdatedAt,
    priceSource: card.priceSource ?? null,
  };
}

export function toCatalogBody(body: CardsApiBody): {
  data: CatalogCard[];
  meta: CardsApiMeta;
} {
  const data = (body.data || []).map(slimCatalogCard);
  return {
    data,
    meta: {
      category: body.meta?.category,
      total: body.meta?.total ?? data.length,
      releaseDate: body.meta?.releaseDate ?? null,
      catalogSource: body.meta?.catalogSource,
      part: "catalog",
    },
  };
}

export function toPricesBody(body: CardsApiBody): {
  data: CardPricePatch[];
  meta: CardsApiMeta;
} {
  return {
    data: (body.data || []).map((card) => ({
      id: card.id,
      marketPrice: card.marketPrice,
      priceVariant: card.priceVariant,
      priceUpdatedAt: card.priceUpdatedAt,
      priceSource: card.priceSource ?? null,
    })),
    meta: {
      ...body.meta,
      part: "prices",
    },
  };
}

/** Authoritative price merge. Cards missing from the patch list lose their price. */
export function applyPricePatches(
  cards: CardWithPrice[],
  patches: CardPricePatch[],
): CardWithPrice[] {
  const byId = new Map(patches.map((patch) => [patch.id, patch]));
  return cards.map((card) => {
    const patch = byId.get(card.id);
    if (!patch) {
      return {
        ...card,
        marketPrice: null,
        priceVariant: null,
        priceUpdatedAt: null,
        priceSource: null,
      };
    }
    return {
      ...card,
      marketPrice: patch.marketPrice,
      priceVariant: patch.priceVariant,
      priceUpdatedAt: patch.priceUpdatedAt,
      priceSource: patch.priceSource,
    };
  });
}

/**
 * Keep the previous prices when the price payload is empty (failed/partial),
 * so a revisit never blanks art-adjacent market data.
 */
export function mergeCardPrices(
  cards: CardWithPrice[],
  patches: CardPricePatch[],
): CardWithPrice[] {
  if (!patches.length) return cards;
  return applyPricePatches(cards, patches);
}
