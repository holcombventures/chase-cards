/**
 * TCGdex API client — secondary market-price fallback when Pokémon TCG API
 * has tcgplayer.url but no prices (common for Mega Evolution sets).
 * Also exposes Cardmarket avg / avg30 for set-level MoM trends.
 * https://api.tcgdex.net — no API key required.
 */

import type { CardWithPrice } from "@/lib/types";

const TCGDEX_BASE = "https://api.tcgdex.net/v2/en";
const CONCURRENCY = 10;

export type TcgdexPriceHit = {
  marketPrice: number;
  priceVariant: string;
  priceUpdatedAt: string | null;
  source: "tcgdex";
  /** Normalized set number used as map key */
  numberKey: string;
  name: string;
};

/** Per-card Cardmarket snapshot for MoM (EUR; used only for % change). */
export type TcgdexCardmarketHit = {
  numberKey: string;
  name: string;
  /** Preferred current: avg, else trend */
  current: number;
  currentField: "avg" | "trend";
  avg30: number;
  updatedAt: string | null;
};

export type TcgdexSetPriceBundle = {
  tcgdexSetId: string;
  releaseDate: string | null;
  prices: Map<string, TcgdexPriceHit[]>;
  cardmarket: Map<string, TcgdexCardmarketHit[]>;
};

type TcgdexSetSummary = {
  id: string;
  name: string;
};

type TcgdexSetDetail = {
  id: string;
  name: string;
  releaseDate?: string;
  cardCount?: { total?: number; official?: number };
  cards: Array<{
    id: string;
    localId: string;
    name: string;
  }>;
};

type TcgplayerVariantPrices = {
  marketPrice?: number | null;
  lowPrice?: number | null;
  midPrice?: number | null;
  highPrice?: number | null;
  directLowPrice?: number | null;
};

type TcgplayerPricingBlock = {
  unit?: string;
  updated?: string;
  [variant: string]: TcgplayerVariantPrices | string | undefined;
};

type CardmarketPricingBlock = {
  unit?: string;
  updated?: string;
  avg?: number | null;
  trend?: number | null;
  avg30?: number | null;
  low?: number | null;
  avg1?: number | null;
  avg7?: number | null;
  [key: string]: number | string | null | undefined;
};

type TcgdexCardFull = {
  id: string;
  localId: string;
  name: string;
  image?: string | null;
  rarity?: string | null;
  set?: { id?: string; name?: string; cardCount?: { total?: number; official?: number } };
  pricing?: {
    tcgplayer?: TcgplayerPricingBlock;
    cardmarket?: CardmarketPricingBlock;
  };
  variants_detailed?: Array<{
    type?: string;
    pricing?: {
      tcgplayer?: TcgplayerPricingBlock;
      cardmarket?: CardmarketPricingBlock;
    };
  }>;
};

/** Strip leading zeros from numeric portions for cross-API matching. */
export function normalizeCardNumber(n: string): string {
  return n
    .trim()
    .replace(/^0+(\d)/, "$1")
    .replace(/^([A-Za-z]+)0+(\d)/, "$1$2")
    .toLowerCase();
}

/**
 * Heuristic pokemontcg set id → likely TCGdex id.
 * Examples: me4→me04, me5→me05, me2pt5→me02.5, sv8→sv08, sv8pt5→sv08.5
 */
export function heuristicTcgdexSetId(pokemontcgId: string): string | null {
  const id = pokemontcgId.trim().toLowerCase();
  // letter(s) + digits + optional "pt" + digits
  const m = id.match(/^([a-z]+)(\d+)(?:pt(\d+))?$/i);
  if (!m) return null;
  const prefix = m[1];
  const major = m[2].padStart(2, "0");
  const minor = m[3];
  if (minor !== undefined) {
    return `${prefix}${major}.${minor}`;
  }
  // Only rewrite when padding actually changes the id (avoid sv10→sv10 noop issues)
  const candidate = `${prefix}${major}`;
  return candidate !== id ? candidate : null;
}

async function tcgdexFetch<T>(path: string): Promise<T> {
  const url = `${TCGDEX_BASE}${path}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`TCGdex API error (${res.status}) for ${path}`);
  }
  return (await res.json()) as T;
}

let setsCache: TcgdexSetSummary[] | null = null;


/** Known pokemontcg → TCGdex id aliases when heuristics/name matching fail. */
const SET_ID_ALIASES: Record<string, string> = {
  me55c: "30th-c",
  me55: "30th",
};

/** In-memory cache so cards fallback + stats share one TCGdex load per set. */
const setBundleCache = new Map<string, Promise<TcgdexSetPriceBundle>>();

async function listTcgdexSets(): Promise<TcgdexSetSummary[]> {
  if (setsCache) return setsCache;
  const data = await tcgdexFetch<TcgdexSetSummary[]>("/sets");
  setsCache = data.map((s) => ({ id: s.id, name: s.name }));
  return setsCache;
}

/**
 * Resolve a pokemontcg set (id + name) to a TCGdex set id.
 * Prefer exact name match; also try id heuristics / exact id.
 */
export async function resolveTcgdexSetId(
  pokemontcgId: string,
  setName?: string | null
): Promise<string | null> {
  const sets = await listTcgdexSets();
  const nameNorm = (setName || "").trim().toLowerCase();
  const lowerId = pokemontcgId.trim().toLowerCase();

  const aliased = SET_ID_ALIASES[lowerId];
  if (aliased && sets.some((s) => s.id.toLowerCase() === aliased.toLowerCase())) {
    return sets.find((s) => s.id.toLowerCase() === aliased.toLowerCase())!.id;
  }

  if (nameNorm) {
    const exactName = sets.find((s) => s.name.trim().toLowerCase() === nameNorm);
    if (exactName) return exactName.id;
  }

  if (sets.some((s) => s.id.toLowerCase() === lowerId)) {
    return sets.find((s) => s.id.toLowerCase() === lowerId)!.id;
  }

  const heuristic = heuristicTcgdexSetId(pokemontcgId);
  if (heuristic && sets.some((s) => s.id.toLowerCase() === heuristic.toLowerCase())) {
    return sets.find((s) => s.id.toLowerCase() === heuristic.toLowerCase())!.id;
  }

  // Soft name contains (last resort)
  if (nameNorm) {
    const partial = sets.find(
      (s) =>
        s.name.trim().toLowerCase().includes(nameNorm) ||
        nameNorm.includes(s.name.trim().toLowerCase())
    );
    if (partial) return partial.id;
  }

  return null;
}

function isPriceVariantEntry(
  key: string,
  value: unknown
): value is TcgplayerVariantPrices {
  if (key === "unit" || key === "updated") return false;
  return typeof value === "object" && value !== null;
}

/** Highest TCGPlayer marketPrice across a pricing.tcgplayer block. */
function bestFromTcgplayerBlock(
  block: TcgplayerPricingBlock | undefined
): { marketPrice: number; priceVariant: string; updatedAt: string | null } | null {
  if (!block) return null;
  let best: number | null = null;
  let bestVariant: string | null = null;
  const updatedAt =
    typeof block.updated === "string" ? block.updated : null;

  for (const [key, value] of Object.entries(block)) {
    if (!isPriceVariantEntry(key, value)) continue;
    const market = value.marketPrice;
    if (typeof market === "number" && Number.isFinite(market) && market >= 0) {
      if (best === null || market > best) {
        best = market;
        bestVariant = key;
      }
    }
  }

  if (best === null || !bestVariant) return null;
  return { marketPrice: best, priceVariant: bestVariant, updatedAt };
}

export function extractTcgdexMarketPrice(card: TcgdexCardFull): {
  marketPrice: number;
  priceVariant: string;
  priceUpdatedAt: string | null;
} | null {
  const tcgHits: Array<{
    marketPrice: number;
    priceVariant: string;
    updatedAt: string | null;
  }> = [];

  const top = bestFromTcgplayerBlock(card.pricing?.tcgplayer);
  if (top) tcgHits.push(top);

  for (const detail of card.variants_detailed ?? []) {
    const hit = bestFromTcgplayerBlock(detail.pricing?.tcgplayer);
    if (hit) tcgHits.push(hit);
  }

  if (tcgHits.length > 0) {
    tcgHits.sort((a, b) => b.marketPrice - a.marketPrice);
    const best = tcgHits[0];
    return {
      marketPrice: best.marketPrice,
      priceVariant: best.priceVariant,
      priceUpdatedAt: best.updatedAt,
    };
  }

  // Cardmarket EUR is available on TCGdex but intentionally not used for USD tiles:
  // the UI formats marketPrice as USD. Prefer null over a misleading currency.
  return null;
}

function finiteNonNeg(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * Extract Cardmarket current (avg preferred, else trend) vs avg30 from a card.
 * Uses the top-level cardmarket block once (variants often duplicate the same product).
 */
export function extractTcgdexCardmarket(card: TcgdexCardFull): {
  current: number;
  currentField: "avg" | "trend";
  avg30: number;
  updatedAt: string | null;
} | null {
  const blocks: CardmarketPricingBlock[] = [];
  if (card.pricing?.cardmarket) blocks.push(card.pricing.cardmarket);
  for (const detail of card.variants_detailed ?? []) {
    if (detail.pricing?.cardmarket) blocks.push(detail.pricing.cardmarket);
  }

  for (const block of blocks) {
    const avg30 = block.avg30;
    if (!finiteNonNeg(avg30) || avg30 === 0) continue;

    let current: number | null = null;
    let currentField: "avg" | "trend" | null = null;
    if (finiteNonNeg(block.avg)) {
      current = block.avg;
      currentField = "avg";
    } else if (finiteNonNeg(block.trend)) {
      current = block.trend;
      currentField = "trend";
    }
    if (current === null || !currentField) continue;

    return {
      current,
      currentField,
      avg30,
      updatedAt: typeof block.updated === "string" ? block.updated : null,
    };
  }
  return null;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/**
 * Fetch TCGPlayer + Cardmarket metrics for all cards in a TCGdex set.
 * Results are cached in-memory by tcgdex set id for the process lifetime
 * so cards fallback and /stats share one load.
 */
export async function fetchTcgdexPricesForSet(
  tcgdexSetId: string
): Promise<TcgdexSetPriceBundle> {
  const cached = setBundleCache.get(tcgdexSetId);
  if (cached) return cached;

  const promise = (async (): Promise<TcgdexSetPriceBundle> => {
    const detail = await tcgdexFetch<TcgdexSetDetail>(
      `/sets/${encodeURIComponent(tcgdexSetId)}`
    );
    const listings = detail.cards ?? [];
    const releaseDate =
      typeof detail.releaseDate === "string" && detail.releaseDate.trim()
        ? detail.releaseDate.trim()
        : null;

    const rows = await mapPool(listings, CONCURRENCY, async (listing) => {
      try {
        const full = await tcgdexFetch<TcgdexCardFull>(
          `/cards/${encodeURIComponent(listing.id)}`
        );
        const numberKey = normalizeCardNumber(full.localId || listing.localId);
        const name = full.name || listing.name;
        const price = extractTcgdexMarketPrice(full);
        const cm = extractTcgdexCardmarket(full);
        return {
          numberKey,
          name,
          price: price
            ? ({
                marketPrice: price.marketPrice,
                priceVariant: price.priceVariant,
                priceUpdatedAt: price.priceUpdatedAt,
                source: "tcgdex" as const,
                numberKey,
                name,
              } satisfies TcgdexPriceHit)
            : null,
          cardmarket: cm
            ? ({
                numberKey,
                name,
                current: cm.current,
                currentField: cm.currentField,
                avg30: cm.avg30,
                updatedAt: cm.updatedAt,
              } satisfies TcgdexCardmarketHit)
            : null,
        };
      } catch {
        return null;
      }
    });

    const prices = new Map<string, TcgdexPriceHit[]>();
    const cardmarket = new Map<string, TcgdexCardmarketHit[]>();
    for (const row of rows) {
      if (!row) continue;
      if (row.price) {
        const list = prices.get(row.numberKey) ?? [];
        list.push(row.price);
        prices.set(row.numberKey, list);
      }
      if (row.cardmarket) {
        const list = cardmarket.get(row.numberKey) ?? [];
        list.push(row.cardmarket);
        cardmarket.set(row.numberKey, list);
      }
    }

    return {
      tcgdexSetId,
      releaseDate,
      prices,
      cardmarket,
    };
  })();

  setBundleCache.set(tcgdexSetId, promise);
  try {
    return await promise;
  } catch (err) {
    setBundleCache.delete(tcgdexSetId);
    throw err;
  }
}

export function lookupTcgdexPrice(
  map: Map<string, TcgdexPriceHit[]>,
  cardNumber: string,
  cardName: string
): TcgdexPriceHit | null {
  const key = normalizeCardNumber(cardNumber);
  const hits = map.get(key);
  if (!hits || hits.length === 0) return null;
  if (hits.length === 1) return hits[0];

  const nameNorm = cardName.trim().toLowerCase();
  const byName = hits.find((h) => h.name.trim().toLowerCase() === nameNorm);
  if (byName) return byName;

  // Soft name match
  const soft = hits.find(
    (h) =>
      h.name.trim().toLowerCase().includes(nameNorm) ||
      nameNorm.includes(h.name.trim().toLowerCase())
  );
  return soft ?? hits[0];
}

/**
 * Resolve set + fetch all TCGdex prices (and Cardmarket MoM fields) for a pokemontcg set.
 */
export async function fetchTcgdexFallbackPrices(
  pokemontcgSetId: string,
  setName?: string | null
): Promise<TcgdexSetPriceBundle | null> {
  const tcgdexSetId = await resolveTcgdexSetId(pokemontcgSetId, setName);
  if (!tcgdexSetId) return null;
  return fetchTcgdexPricesForSet(tcgdexSetId);
}


/**
 * When Pokémon TCG API is down or returns no cards, build a priced catalog
 * entirely from TCGdex (images + market prices).
 */
export async function fetchTcgdexOnlyCards(
  pokemontcgSetId: string,
  setName?: string | null
): Promise<{ cards: CardWithPrice[]; bundle: TcgdexSetPriceBundle } | null> {
  const tcgdexSetId = await resolveTcgdexSetId(pokemontcgSetId, setName);
  if (!tcgdexSetId) return null;

  const detail = await tcgdexFetch<TcgdexSetDetail>(
    `/sets/${encodeURIComponent(tcgdexSetId)}`
  );
  const listings = detail.cards ?? [];
  const releaseDate =
    typeof detail.releaseDate === "string" && detail.releaseDate.trim()
      ? detail.releaseDate.trim()
      : null;
  const setDisplayName = detail.name || setName || pokemontcgSetId;
  const printedTotal =
    detail.cardCount?.official ?? detail.cardCount?.total ?? listings.length;

  const rows = await mapPool(listings, CONCURRENCY, async (listing) => {
    try {
      const full = await tcgdexFetch<TcgdexCardFull>(
        `/cards/${encodeURIComponent(listing.id)}`
      );
      const number = full.localId || listing.localId;
      const numberKey = normalizeCardNumber(number);
      const name = full.name || listing.name;
      const price = extractTcgdexMarketPrice(full);
      const cm = extractTcgdexCardmarket(full);
      const imageBase =
        typeof full.image === "string" && full.image.trim()
          ? full.image.trim()
          : null;
      const small = imageBase ? `${imageBase}/low.webp` : "";
      const large = imageBase ? `${imageBase}/high.webp` : "";

      const card: CardWithPrice = {
        id: `${pokemontcgSetId}-${number}`,
        name,
        number,
        rarity: full.rarity || undefined,
        images: { small, large },
        set: {
          id: pokemontcgSetId,
          name: setDisplayName,
          printedTotal: printedTotal || listings.length,
          total: listings.length,
        },
        marketPrice: price?.marketPrice ?? null,
        priceVariant: price?.priceVariant ?? null,
        priceUpdatedAt: price?.priceUpdatedAt ?? null,
        priceSource: price ? "tcgdex" : null,
      };

      return {
        card,
        priceHit: price
          ? ({
              marketPrice: price.marketPrice,
              priceVariant: price.priceVariant,
              priceUpdatedAt: price.priceUpdatedAt,
              source: "tcgdex" as const,
              numberKey,
              name,
            } satisfies TcgdexPriceHit)
          : null,
        cardmarket: cm
          ? ({
              numberKey,
              name,
              current: cm.current,
              currentField: cm.currentField,
              avg30: cm.avg30,
              updatedAt: cm.updatedAt,
            } satisfies TcgdexCardmarketHit)
          : null,
      };
    } catch {
      return null;
    }
  });

  const cards: CardWithPrice[] = [];
  const prices = new Map<string, TcgdexPriceHit[]>();
  const cardmarket = new Map<string, TcgdexCardmarketHit[]>();
  for (const row of rows) {
    if (!row) continue;
    cards.push(row.card);
    if (row.priceHit) {
      const list = prices.get(row.priceHit.numberKey) ?? [];
      list.push(row.priceHit);
      prices.set(row.priceHit.numberKey, list);
    }
    if (row.cardmarket) {
      const list = cardmarket.get(row.cardmarket.numberKey) ?? [];
      list.push(row.cardmarket);
      cardmarket.set(row.cardmarket.numberKey, list);
    }
  }

  if (cards.length === 0) return null;

  const bundle: TcgdexSetPriceBundle = {
    tcgdexSetId,
    releaseDate,
    prices,
    cardmarket,
  };
  // Warm the shared cache for /stats
  setBundleCache.set(tcgdexSetId, Promise.resolve(bundle));

  return { cards, bundle };
}

/** Flatten unique Cardmarket hits (one per numberKey, first entry). */
export function flattenCardmarketHits(
  map: Map<string, TcgdexCardmarketHit[]>
): TcgdexCardmarketHit[] {
  const out: TcgdexCardmarketHit[] = [];
  for (const hits of map.values()) {
    if (hits[0]) out.push(hits[0]);
  }
  return out;
}
