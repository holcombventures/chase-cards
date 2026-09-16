import { NextResponse } from "next/server";
import { fetchCardsBySet, PokemonTcgApiError } from "@/lib/api";
import { enrichCard } from "@/lib/prices";
import {
  fetchTcgdexFallbackPrices,
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

export async function GET(request: Request, { params }: Params) {
  const { setId } = await params;

  if (!setId || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid set id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const releaseDateParam = url.searchParams.get("releaseDate");

  try {
    const raw = await fetchCardsBySet(setId);
    let cards: CardWithPrice[] = raw.map((card) => {
      const enriched = enrichCard(card);
      return {
        ...enriched,
        priceSource: enriched.marketPrice !== null ? ("pokemontcg" as const) : null,
      };
    });

    let pricedCount = cards.filter((c) => c.marketPrice !== null).length;
    let fallbackUsed = false;
    let tcgdexBundle: TcgdexSetPriceBundle | null = null;
    let tcgdexAttempted = false;

    const setName = cards[0]?.set?.name ?? null;

    // v1: only fall back when primary yields zero usable market prices
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
          pricedCount = cards.filter((c) => c.marketPrice !== null).length;
        }
      } catch (err) {
        console.error("TCGdex fallback failed:", err);
        // Keep nulls — do not invent prices
      }
    }

    // MoM needs Cardmarket avg/avg30 via TCGdex — reuse bundle if fallback already loaded
    if (!tcgdexBundle) {
      tcgdexAttempted = true;
      try {
        tcgdexBundle = await fetchTcgdexFallbackPrices(setId, setName);
      } catch (err) {
        console.error("TCGdex MoM fetch failed:", err);
        tcgdexBundle = null;
      }
    }

    const priceSource = computePriceSource(cards);
    const releaseDate =
      releaseDateParam ||
      tcgdexBundle?.releaseDate ||
      null;

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
        total: cards.length,
        pricedCount,
        missingPriceCount: cards.length - pricedCount,
        priceSource,
        fallbackUsed,
        releaseDate,
        stats,
      },
    });
  } catch (err) {
    if (err instanceof PokemonTcgApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 429 ? 429 : 502 });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error loading cards from the Pokémon TCG API." },
      { status: 500 }
    );
  }
}
