import { NextResponse } from "next/server";
import { PokemonTcgApiError } from "@/lib/api";
import {
  cacheHeaders,
  catalogIsFresh,
  payloadCacheKey,
  pricesAreFresh,
  toCatalogBody,
  toPricesBody,
  type CardsApiBody,
  type CardsApiMeta,
} from "@/lib/cardCacheModel";
import {
  loadSharedPayload,
  readCachedPayload,
  type PayloadLoadResult,
} from "@/lib/setPayloadCache";
import { enrichCard, normalizeCardsSetTotals } from "@/lib/prices";
import {
  fetchTcgdexFallbackPrices,
  fetchTcgdexOnlyCards,
  type TcgdexSetPriceBundle,
  lookupTcgdexPrice,
} from "@/lib/tcgdex";
import { buildSetStats } from "@/lib/stats";
import type { CardWithPrice, CardsMetaPriceSource, PriceSource } from "@/lib/types";
import {
  assertLiveCatalog,
  CatalogNotLiveError,
  hasCatalogAdapter,
  isCategoryId,
  type CategoryId,
} from "@/lib/catalog";
import * as pokemonCatalog from "@/lib/catalog/pokemon";
import * as onePieceCatalog from "@/lib/catalog/one-piece";
import { OnePieceApiError } from "@/lib/catalog/one-piece";
import {
  mergeFullBodyWithSnapshot,
  priceCacheRefreshAllowed,
  pricePayloadFromSnapshot,
  type PriceCacheState,
} from "@/lib/priceSnapshot";
import {
  readFreshPriceSnapshot,
  savePriceSnapshot,
  priceSnapshotStoreKind,
} from "@/lib/priceSnapshotStore";

type Params = { params: Promise<{ setId: string }> };

/**
 * Handler always runs (prices must not be frozen in the Next data cache).
 * Catalog vs price freshness is controlled by the HTTP cache headers below.
 */
export const dynamic = "force-dynamic";

function pricesAsOfNow(): string {
  return new Date().toISOString();
}

function withPriceCache<T extends { meta?: CardsApiMeta }>(
  payload: T,
  priceCache: PriceCacheState,
): T {
  return {
    ...payload,
    meta: { ...payload.meta, priceCache },
  };
}

function priceResponseHeaders(
  part: "prices" | "full",
  priceCache: PriceCacheState,
): Record<string, string> {
  return {
    ...cacheHeaders(part),
    "x-price-cache": priceCache,
    "x-price-store": priceSnapshotStoreKind(),
  };
}

/** Persist a successful upstream price payload when the shared snapshot is stale. */
async function rememberPriceSnapshot(
  category: string,
  setId: string,
  body: CardsApiBody,
  force: boolean,
): Promise<void> {
  try {
    if (!force) {
      const fresh = await readFreshPriceSnapshot(category, setId);
      if (fresh) return;
    }
    await savePriceSnapshot(category, setId, body);
  } catch (err) {
    console.error("price snapshot write failed:", err);
  }
}

function parseCategory(request: Request): CategoryId {
  const url = new URL(request.url);
  const raw = url.searchParams.get("category") || "pokemon";
  if (!isCategoryId(raw) || !hasCatalogAdapter(raw)) {
    throw new Response(
      JSON.stringify({ error: "Invalid or non-live category." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }
  return raw;
}

function computePokemonPriceSource(cards: CardWithPrice[]): CardsMetaPriceSource {
  let hasPrimary = false;
  let hasFallback = false;
  for (const c of cards) {
    if (c.marketPrice === null) continue;
    if (c.priceSource === "tcgdex") hasFallback = true;
    else hasPrimary = true;
  }
  if (hasPrimary && hasFallback) return "mixed";
  if (hasFallback) return "tcgdex";
  if (hasPrimary) return "pokemontcg";
  return "none";
}

async function applyTcgdexPriceFallback(
  cards: CardWithPrice[],
  setId: string,
  setName: string | null,
): Promise<{
  cards: CardWithPrice[];
  pricedCount: number;
  fallbackUsed: boolean;
  tcgdexBundle: TcgdexSetPriceBundle | null;
  tcgdexAttempted: boolean;
}> {
  let pricedCount = cards.filter((c) => c.marketPrice !== null).length;
  let fallbackUsed = false;
  let tcgdexBundle: TcgdexSetPriceBundle | null = null;
  let tcgdexAttempted = false;
  let next = cards;

  if (pricedCount === 0 && cards.length > 0) {
    tcgdexAttempted = true;
    try {
      const fallback = await fetchTcgdexFallbackPrices(setId, setName);
      if (fallback) {
        tcgdexBundle = fallback;
        fallbackUsed = true;
        next = cards.map((card) => {
          if (card.marketPrice !== null) return card;
          const hit = lookupTcgdexPrice(
            fallback.prices,
            card.number,
            card.name,
          );
          if (!hit) return card;
          return {
            ...card,
            marketPrice: hit.marketPrice,
            priceVariant: hit.priceVariant,
            priceUpdatedAt: hit.priceUpdatedAt,
            priceSource: "tcgdex" as const,
          };
        });
        pricedCount = next.filter((c) => c.marketPrice !== null).length;
      }
    } catch (err) {
      console.error("TCGdex fallback failed:", err);
    }
  }

  if (!tcgdexBundle) {
    tcgdexAttempted = true;
    try {
      tcgdexBundle = await fetchTcgdexFallbackPrices(setId, setName);
    } catch (err) {
      console.error("TCGdex MoM fetch failed:", err);
      tcgdexBundle = null;
    }
  }

  return {
    cards: next,
    pricedCount,
    fallbackUsed,
    tcgdexBundle,
    tcgdexAttempted,
  };
}

async function handlePokemon(
  setId: string,
  releaseDateParam: string | null,
  setNameParam: string | null,
) {
  let cards: CardWithPrice[] = [];
  let primaryFailed = false;

  try {
    const raw = await pokemonCatalog.fetchCards(setId);
    cards = normalizeCardsSetTotals(
      raw.map((card) => {
        const enriched = enrichCard(card);
        return {
          ...enriched,
          priceSource:
            enriched.marketPrice !== null ? ("pokemontcg" as const) : null,
        };
      }),
    );
  } catch (err) {
    if (err instanceof PokemonTcgApiError) {
      primaryFailed = true;
      console.warn(
        `pokemontcg cards failed for ${setId} (${err.status}); trying TCGdex-only catalog`,
      );
    } else {
      throw err;
    }
  }

  // Empty primary payload (or hard upstream failure) → TCGdex-only catalog
  if (primaryFailed || cards.length === 0) {
    try {
      const only = await fetchTcgdexOnlyCards(
        setId,
        setNameParam || cards[0]?.set?.name || null,
      );
      if (only && only.cards.length > 0) {
        const onlyCards = normalizeCardsSetTotals(only.cards);
        const priceSource = computePokemonPriceSource(onlyCards);
        const releaseDate =
          releaseDateParam || only.bundle.releaseDate || null;
        const pricedCount = onlyCards.filter(
          (c) => c.marketPrice !== null,
        ).length;
        const stats = buildSetStats({
          cards: onlyCards,
          priceSource,
          releaseDate,
          tcgdexBundle: only.bundle,
          tcgdexAttempted: true,
        });
        return NextResponse.json({
          data: onlyCards,
          meta: {
            category: "pokemon",
            total: onlyCards.length,
            pricedCount,
            missingPriceCount: onlyCards.length - pricedCount,
            priceSource,
            fallbackUsed: true,
            releaseDate,
            stats,
            catalogSource: "tcgdex",
            pricesAsOf: pricesAsOfNow(),
          },
        });
      }
    } catch (err) {
      console.error("TCGdex-only catalog failed:", err);
    }

    if (primaryFailed) {
      return NextResponse.json(
        {
          error:
            "Pokémon TCG API is temporarily unavailable for this set, and no TCGdex fallback catalog was found. Please retry.",
        },
        { status: 502 },
      );
    }
  }

  const setName = setNameParam || cards[0]?.set?.name || null;
  const applied = await applyTcgdexPriceFallback(cards, setId, setName);
  cards = normalizeCardsSetTotals(applied.cards);

  const priceSource = computePokemonPriceSource(cards);
  const releaseDate =
    releaseDateParam || applied.tcgdexBundle?.releaseDate || null;

  const stats = buildSetStats({
    cards,
    priceSource,
    releaseDate,
    tcgdexBundle: applied.tcgdexBundle,
    tcgdexAttempted: applied.tcgdexAttempted,
  });

  return NextResponse.json({
    data: cards,
    meta: {
      category: "pokemon",
      total: cards.length,
      pricedCount: applied.pricedCount,
      missingPriceCount: cards.length - applied.pricedCount,
      priceSource,
      fallbackUsed: applied.fallbackUsed,
      releaseDate,
      stats,
      catalogSource: "pokemontcg",
      pricesAsOf: pricesAsOfNow(),
    },
  });
}

async function handleOnePiece(
  setId: string,
  releaseDateParam: string | null,
) {
  const { cards: raw, meta: fetchMeta } = await onePieceCatalog.fetchCards(setId);
  const backend: PriceSource = fetchMeta.priceBackend;

  const cards: CardWithPrice[] = normalizeCardsSetTotals(
    raw.map((card) => {
      const enriched = enrichCard(card);
      return {
        ...enriched,
        priceSource: enriched.marketPrice !== null ? backend : null,
      };
    }),
  );

  const pricedCount = cards.filter((c) => c.marketPrice !== null).length;
  const priceSource: CardsMetaPriceSource =
    pricedCount > 0 ? backend : "none";

  const stats = buildSetStats({
    cards,
    priceSource,
    releaseDate: releaseDateParam,
    tcgdexBundle: null,
    tcgdexAttempted: false,
    momUnavailableReason:
      "One Piece catalog has no Cardmarket-style ~30-day history",
  });

  return NextResponse.json({
    data: cards,
    meta: {
      category: "one-piece",
      total: cards.length,
      pricedCount,
      missingPriceCount: cards.length - pricedCount,
      priceSource,
      fallbackUsed: false,
      usedOptcgKey: fetchMeta.usedOptcgKey,
      priceBackend: fetchMeta.priceBackend,
      releaseDate: releaseDateParam,
      stats,
      pricesAsOf: pricesAsOfNow(),
    },
  });
}

async function loadFullCardsResponse(request: Request, { params }: Params) {
  const { setId } = await params;

  if (!setId || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid set id." }, { status: 400 });
  }

  let category: CategoryId;
  try {
    category = parseCategory(request);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const url = new URL(request.url);
  const releaseDateParam = url.searchParams.get("releaseDate");
  const setNameParam = url.searchParams.get("setName");

  try {
    assertLiveCatalog(category);
    if (category === "one-piece") {
      return await handleOnePiece(setId, releaseDateParam);
    }
    return await handlePokemon(setId, releaseDateParam, setNameParam);
  } catch (err) {
    if (err instanceof PokemonTcgApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    if (err instanceof OnePieceApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    if (err instanceof CatalogNotLiveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error loading cards." },
      { status: 500 },
    );
  }
}

function isCardsBody(body: unknown): body is CardsApiBody {
  return (
    Boolean(body) &&
    typeof body === "object" &&
    Array.isArray((body as CardsApiBody).data)
  );
}

async function readCardsBody(
  request: Request,
  ctx: Params,
): Promise<PayloadLoadResult> {
  const res = await loadFullCardsResponse(request, ctx);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    body = { error: "Unexpected error loading cards." };
  }
  if (!res.ok || !isCardsBody(body)) {
    return { ok: false, status: res.status || 500, body };
  }
  return { ok: true, body };
}

export async function GET(request: Request, ctx: Params) {
  const url = new URL(request.url);
  const partParam = url.searchParams.get("part");
  const part =
    partParam === "catalog" || partParam === "prices" ? partParam : "full";

  let category: CategoryId;
  try {
    category = parseCategory(request);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  const { setId } = await ctx.params;
  if (!setId || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return loadFullCardsResponse(request, ctx);
  }

  const key = payloadCacheKey({
    category,
    setId,
    setName: url.searchParams.get("setName"),
    releaseDate: url.searchParams.get("releaseDate"),
  });

  const refreshPrices =
    url.searchParams.get("priceCache") === "refresh" &&
    priceCacheRefreshAllowed();

  const cached = readCachedPayload(key);
  if (
    cached &&
    part === "catalog" &&
    catalogIsFresh(cached.storedAt) &&
    !refreshPrices
  ) {
    return NextResponse.json(toCatalogBody(cached.body), {
      headers: cacheHeaders("catalog"),
    });
  }

  // Durable snapshot first so every instance shares one ~4h price copy.
  // The 60s process cache is only the fallback when Blobs is unreachable.
  if (!refreshPrices && part !== "catalog") {
    const snap = await readFreshPriceSnapshot(category, setId);
    if (snap && part === "prices") {
      return NextResponse.json(pricePayloadFromSnapshot(snap, "hit"), {
        headers: priceResponseHeaders("prices", "hit"),
      });
    }
    if (snap && part === "full" && cached && catalogIsFresh(cached.storedAt)) {
      return NextResponse.json(
        withPriceCache(mergeFullBodyWithSnapshot(cached.body, snap), "hit"),
        { headers: priceResponseHeaders("full", "hit") },
      );
    }
  }

  if (
    !refreshPrices &&
    cached &&
    part !== "catalog" &&
    pricesAreFresh(cached.storedAt)
  ) {
    const payload = part === "prices" ? toPricesBody(cached.body) : cached.body;
    const served = part === "prices" ? "prices" : "full";
    return NextResponse.json(withPriceCache(payload, "memory"), {
      headers: priceResponseHeaders(served, "memory"),
    });
  }

  const result = await loadSharedPayload(
    key,
    () => readCardsBody(request, ctx),
    Date.now(),
    { refreshPrices },
  );
  if (!result.ok) {
    return NextResponse.json(
      result.body ?? { error: "Unexpected error loading cards." },
      { status: result.status, headers: cacheHeaders("full") },
    );
  }

  await rememberPriceSnapshot(category, setId, result.body, refreshPrices);

  if (part === "catalog") {
    return NextResponse.json(toCatalogBody(result.body), {
      headers: cacheHeaders("catalog"),
    });
  }
  if (part === "prices") {
    return NextResponse.json(withPriceCache(toPricesBody(result.body), "miss"), {
      headers: priceResponseHeaders("prices", "miss"),
    });
  }
  return NextResponse.json(withPriceCache(result.body, "miss"), {
    headers: priceResponseHeaders("full", "miss"),
  });
}
