import type { PokemonCard, CardWithPrice, TcgPlayerPriceVariant } from "./types";

/**
 * Prefer the highest TCGPlayer `market` among print variants
 * (holofoil, reverseHolofoil, normal, etc.). That best reflects
 * the card's top market value for chase ranking.
 */
export function extractMarketPrice(card: PokemonCard): {
  marketPrice: number | null;
  priceVariant: string | null;
  priceUpdatedAt: string | null;
} {
  const prices = card.tcgplayer?.prices;
  if (!prices) {
    return { marketPrice: null, priceVariant: null, priceUpdatedAt: null };
  }

  let best: number | null = null;
  let bestVariant: string | null = null;

  for (const [variant, entry] of Object.entries(prices)) {
    const market = (entry as TcgPlayerPriceVariant)?.market;
    if (typeof market === "number" && Number.isFinite(market) && market >= 0) {
      if (best === null || market > best) {
        best = market;
        bestVariant = variant;
      }
    }
  }

  return {
    marketPrice: best,
    priceVariant: bestVariant,
    priceUpdatedAt: card.tcgplayer?.updatedAt ?? null,
  };
}

export function enrichCard(card: PokemonCard): CardWithPrice {
  const price = extractMarketPrice(card);
  return { ...card, ...price };
}

/**
 * Chase cards = top 20% of cards that have a usable market price,
 * rounded up (ceil), with a minimum of 1 when the priced set is non-empty.
 */
export function selectChaseCards(cards: CardWithPrice[]): CardWithPrice[] {
  const priced = cards
    .filter((c) => c.marketPrice !== null)
    .sort((a, b) => (b.marketPrice as number) - (a.marketPrice as number));

  if (priced.length === 0) return [];

  const count = Math.max(1, Math.ceil(priced.length * 0.2));
  return priced.slice(0, count);
}

/** Natural-ish set number sort: "1", "2", "10", "TG01", etc. */
export function sortBySetNumber(cards: CardWithPrice[]): CardWithPrice[] {
  return [...cards].sort((a, b) => {
    const an = parseSetNumber(a.number);
    const bn = parseSetNumber(b.number);
    if (an.prefix !== bn.prefix) {
      return an.prefix.localeCompare(bn.prefix);
    }
    if (an.num !== bn.num) return an.num - bn.num;
    return a.number.localeCompare(b.number, undefined, { numeric: true });
  });
}

function parseSetNumber(n: string): { prefix: string; num: number } {
  const match = n.match(/^([A-Za-z]*)(\d+)/);
  if (!match) return { prefix: n, num: Number.MAX_SAFE_INTEGER };
  return { prefix: match[1] || "", num: parseInt(match[2], 10) };
}

export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

export function formatVariant(variant: string | null): string {
  if (!variant) return "";
  return variant
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
