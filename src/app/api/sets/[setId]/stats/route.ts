import { NextResponse } from "next/server";
import { PokemonTcgApiError } from "@/lib/api";
import { enrichCard } from "@/lib/prices";
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

/**
 * Dedicated set stats endpoint. Shares the in-memory TCGdex bundle cache with
 * /cards so a prior fallback load is not re-fetched (Pokémon only).
 */
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
  const setNameParam = url.searchParams.get("setName");

  try {
    assertLiveCatalog(category);

    if (category === "one-piece") {
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
        momUnavailableReason:
          "One Piece catalog has no Cardmarket-style ~30-day history",
      });
      return NextResponse.json({
        data: stats,
        meta: {
          category,
          setId,
          total: cards.length,
          pricedCount,
          priceSource,
          releaseDate: releaseDateParam,
        },
      });
    }

    let cards: CardWithPrice[] = [];
    let primaryFailed = false;

    try {
      const raw = await pokemonCatalog.fetchCards(setId);
      cards = raw.map((card) => {
        const enriched = enrichCard(card);
        return {
          ...enriched,
          priceSource:
            enriched.marketPrice !== null ? ("pokemontcg" as const) : null,
        };
      });
    } catch (err) {
      if (err instanceof PokemonTcgApiError) {
        primaryFailed = true;
      } else {
        throw err;
      }
    }

    if (primaryFailed || cards.length === 0) {
      try {
        const only = await fetchTcgdexOnlyCards(
          setId,
          setNameParam || cards[0]?.set?.name || null,
        );
        if (only && only.cards.length > 0) {
          const priceSource = computePokemonPriceSource(only.cards);
          const releaseDate =
            releaseDateParam || only.bundle.releaseDate || null;
          const pricedCount = only.cards.filter(
            (c) => c.marketPrice !== null,
          ).length;
          const stats = buildSetStats({
            cards: only.cards,
            priceSource,
            releaseDate,
            tcgdexBundle: only.bundle,
            tcgdexAttempted: true,
          });
          return NextResponse.json({
            data: stats,
            meta: {
              category,
              setId,
              total: only.cards.length,
              pricedCount,
              priceSource,
              releaseDate,
              catalogSource: "tcgdex",
            },
          });
        }
      } catch (err) {
        console.error("TCGdex-only stats catalog failed:", err);
      }
      if (primaryFailed) {
        return NextResponse.json(
          {
            error:
              "Pokémon TCG API is temporarily unavailable for this set, and no TCGdex fallback was found. Please retry.",
          },
          { status: 502 },
        );
      }
    }

    let pricedCount = cards.filter((c) => c.marketPrice !== null).length;
    let tcgdexBundle: TcgdexSetPriceBundle | null = null;
    let tcgdexAttempted = false;
    const setName = setNameParam || cards[0]?.set?.name || null;

    if (pricedCount === 0 && cards.length > 0) {
      tcgdexAttempted = true;
      try {
        const fallback = await fetchTcgdexFallbackPrices(setId, setName);
        if (fallback) {
          tcgdexBundle = fallback;
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
        console.error("TCGdex fallback (stats) failed:", err);
      }
    }

    if (!tcgdexBundle) {
      tcgdexAttempted = true;
      try {
        tcgdexBundle = await fetchTcgdexFallbackPrices(setId, setName);
      } catch (err) {
        console.error("TCGdex MoM (stats) failed:", err);
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
      data: stats,
      meta: {
        category,
        setId,
        total: cards.length,
        pricedCount,
        priceSource,
        releaseDate,
      },
    });
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
      { error: "Unexpected error computing set stats." },
      { status: 500 },
    );
  }
}
