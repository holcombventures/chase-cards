import { NextResponse } from "next/server";
import { PokemonTcgApiError } from "@/lib/api";
import { enrichCard } from "@/lib/prices";
import {
  fetchTcgdexFallbackPrices,
  type TcgdexSetPriceBundle,
  lookupTcgdexPrice,
} from "@/lib/tcgdex";
import { buildSetStats } from "@/lib/stats";
import type { CardWithPrice, CardsMetaPriceSource, PriceSource } from "@/lib/types";
import {
  assertLiveCatalog,
  hasCatalogAdapter,
  isCategoryId,
  type CategoryId,
} from "@/lib/catalog";
import * as pokemonCatalog from "@/lib/catalog/pokemon";
import * as onePieceCatalog from "@/lib/catalog/one-piece";
import { OnePieceApiError } from "@/lib/catalog/one-piece";

type Params = { params: Promise<{ setId: string }> };

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

async function handlePokemon(
  setId: string,
  releaseDateParam: string | null,
) {
  const raw = await pokemonCatalog.fetchCards(setId);
  let cards: CardWithPrice[] = raw.map((card) => {
    const enriched = enrichCard(card);
    return {
      ...enriched,
      priceSource:
        enriched.marketPrice !== null ? ("pokemontcg" as const) : null,
    };
  });

  let pricedCount = cards.filter((c) => c.marketPrice !== null).length;
  let fallbackUsed = false;
  let tcgdexBundle: TcgdexSetPriceBundle | null = null;
  let tcgdexAttempted = false;

  const setName = cards[0]?.set?.name ?? null;

  if (pricedCount === 0 && cards.length > 0) {
    tcgdexAttempted = true;
    try {
      const fallback = await fetchTcgdexFallbackPrices(setId, setName);
      if (fallback) {
        tcgdexBundle = fallback;
        fallbackUsed = true;
        cards = cards.map((card) => {
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
        pricedCount = cards.filter((c) => c.marketPrice !== null).length;
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

  const priceSource = computePokemonPriceSource(cards);
  const releaseDate = releaseDateParam || tcgdexBundle?.releaseDate || null;

  const stats = buildSetStats({
    cards,
    priceSource,
    releaseDate,
    tcgdexBundle,
    tcgdexAttempted,
  });

  return NextResponse.json({
    data: cards,
    meta: {
      category: "pokemon",
      total: cards.length,
      pricedCount,
      missingPriceCount: cards.length - pricedCount,
      priceSource,
      fallbackUsed,
      releaseDate,
      stats,
    },
  });
}

async function handleOnePiece(
  setId: string,
  releaseDateParam: string | null,
) {
  const { cards: raw, meta: fetchMeta } = await onePieceCatalog.fetchCards(setId);
  const backend: PriceSource = fetchMeta.priceBackend;

  const cards: CardWithPrice[] = raw.map((card) => {
    const enriched = enrichCard(card);
    return {
      ...enriched,
      priceSource: enriched.marketPrice !== null ? backend : null,
    };
  });

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
    },
  });
}

export async function GET(request: Request, { params }: Params) {
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

  try {
    assertLiveCatalog(category);
    if (category === "one-piece") {
      return await handleOnePiece(setId, releaseDateParam);
    }
    return await handlePokemon(setId, releaseDateParam);
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
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error loading cards." },
      { status: 500 },
    );
  }
}
