import { NextResponse } from "next/server";
import { fetchCardsBySet, PokemonTcgApiError } from "@/lib/api";
import { enrichCard } from "@/lib/prices";
import {
  fetchTcgdexFallbackPrices,
  fetchTcgdexOnlyCards,
  type TcgdexSetPriceBundle,
  lookupTcgdexPrice,
} from "@/lib/tcgdex";
import { buildSetStats } from "@/lib/stats";
import type { CardWithPrice, CardsMetaPriceSource } from "@/lib/types";

type Params = { params: Promise<{ setId: string }> };

function computePriceSource(cards: CardWithPrice[]): CardsMetaPriceSource {
  let hasPrimary = false;
  let hasFallback = false;
  for (const c of cards) {
    if (c.marketPrice === null) continue;
    if (c.priceSource === "tcgdex") hasFallback = true;
    else hasPrimary = true; // pokemontcg or unset (primary path)
  }
  if (hasPrimary && hasFallback) return "mixed";
  if (hasFallback) return "tcgdex";
  if (hasPrimary) return "pokemontcg";
  return "none";
}

async function applyTcgdexPriceFallback(
  cards: CardWithPrice[],
  setId: string,
  setName: string | null
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
            card.name
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

export async function GET(request: Request, { params }: Params) {
  const { setId } = await params;

  if (!setId || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid set id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const releaseDateParam = url.searchParams.get("releaseDate");
  const setNameParam = url.searchParams.get("setName");

  try {
    let cards: CardWithPrice[] = [];
    let primaryFailed = false;

    try {
      const raw = await fetchCardsBySet(setId);
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
        console.warn(
          `pokemontcg cards failed for ${setId} (${err.status}); trying TCGdex-only catalog`
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
          setNameParam || cards[0]?.set?.name || null
        );
        if (only && only.cards.length > 0) {
          const priceSource = computePriceSource(only.cards);
          const releaseDate =
            releaseDateParam || only.bundle.releaseDate || null;
          const pricedCount = only.cards.filter(
            (c) => c.marketPrice !== null
          ).length;
          const stats = buildSetStats({
            cards: only.cards,
            priceSource,
            releaseDate,
            tcgdexBundle: only.bundle,
            tcgdexAttempted: true,
          });
          return NextResponse.json({
            data: only.cards,
            meta: {
              total: only.cards.length,
              pricedCount,
              missingPriceCount: only.cards.length - pricedCount,
              priceSource,
              fallbackUsed: true,
              releaseDate,
              stats,
              catalogSource: "tcgdex",
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
          { status: 502 }
        );
      }
    }

    const setName = setNameParam || cards[0]?.set?.name || null;
    const applied = await applyTcgdexPriceFallback(cards, setId, setName);
    cards = applied.cards;

    const priceSource = computePriceSource(cards);
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
        total: cards.length,
        pricedCount: applied.pricedCount,
        missingPriceCount: cards.length - applied.pricedCount,
        priceSource,
        fallbackUsed: applied.fallbackUsed,
        releaseDate,
        stats,
        catalogSource: "pokemontcg",
      },
    });
  } catch (err) {
    if (err instanceof PokemonTcgApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error loading cards from the Pokémon TCG API." },
      { status: 500 }
    );
  }
}
