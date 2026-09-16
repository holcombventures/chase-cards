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
    else hasPrimary = true;
  }
  if (hasPrimary && hasFallback) return "mixed";
  if (hasFallback) return "tcgdex";
  if (hasPrimary) return "pokemontcg";
  return "none";
}

/**
 * Dedicated set stats endpoint. Shares the in-memory TCGdex bundle cache with
 * /cards so a prior fallback load is not re-fetched.
 */
export async function GET(request: Request, { params }: Params) {
  const { setId } = await params;

  if (!setId || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid set id." }, { status: 400 });
  }

  const url = new URL(request.url);
  const releaseDateParam = url.searchParams.get("releaseDate");
  const setNameParam = url.searchParams.get("setName");

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
            const hit = lookupTcgdexPrice(fallback.prices, card.number, card.name);
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

    const priceSource = computePriceSource(cards);
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
        { status: err.status === 429 ? 429 : 502 }
      );
    }
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error computing set stats." },
      { status: 500 }
    );
  }
}
