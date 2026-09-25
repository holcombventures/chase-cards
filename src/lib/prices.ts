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

/** Prefer printedTotal if finite >0, else total, else optional fallback. */
export function resolveSetPrintedTotal(
  set: PokemonCard["set"] | null | undefined,
  fallback?: number | null,
): number {
  const printed = set?.printedTotal;
  if (typeof printed === "number" && Number.isFinite(printed) && printed > 0) {
    return printed;
  }
  const total = set?.total;
  if (typeof total === "number" && Number.isFinite(total) && total > 0) {
    return total;
  }
  if (typeof fallback === "number" && Number.isFinite(fallback) && fallback > 0) {
    return fallback;
  }
  return 0;
}

/** Normalize set.printedTotal / set.total so UI never sees undefined. */
export function normalizeCardSetTotals(
  card: PokemonCard,
  fallbackTotal?: number | null,
): PokemonCard {
  const printedTotal = resolveSetPrintedTotal(card.set, fallbackTotal);
  const rawTotal = card.set?.total;
  const total =
    typeof rawTotal === "number" && Number.isFinite(rawTotal) && rawTotal > 0
      ? rawTotal
      : printedTotal;
  return {
    ...card,
    set: {
      id: card.set?.id ?? "",
      name: card.set?.name ?? "",
      printedTotal,
      total,
    },
  };
}

/** After a full set fetch, fill missing printedTotal from cardinality. */
export function normalizeCardsSetTotals(
  cards: CardWithPrice[],
): CardWithPrice[] {
  if (!cards.length) return cards;
  const fallback = cards.length;
  return cards.map((c) => {
    const normalized = normalizeCardSetTotals(c, fallback);
    return { ...c, set: normalized.set };
  });
}

export function enrichCard(card: PokemonCard): CardWithPrice {
  const price = extractMarketPrice(card);
  const normalized = normalizeCardSetTotals(card);
  return { ...normalized, ...price };
}

export type ChaseMode = "priced" | "estimated";

export type ChaseSelection = {
  cards: CardWithPrice[];
  mode: ChaseMode;
  /** Set-level note when chase is estimated from historical patterns */
  note?: string | null;
};

export type SelectChaseOptions = {
  /** Live catalog id — drives rarity heuristics when prices are missing */
  categoryId?: string | null;
};

export const ESTIMATED_CHASE_NOTE =
  "New set — chase estimated from historical patterns; prices coming when market data lands.";

/** Minimum usable market prices before we prefer priced ranking over estimate. */
const MIN_PRICED_FOR_RANK = 1;

/**
 * Chase selection — single source of truth.
 *
 * - If ≥1 card has a usable marketPrice: top ceil(priced*20%) by price (`priced`).
 * - Else if the set has cards: top ceil(n*20%) by heuristic score (`estimated`).
 * - Else empty (`priced`, no cards).
 *
 * Never invents dollar amounts — marketPrice stays whatever enrichment set.
 */
export function selectChaseCards(
  cards: CardWithPrice[],
  options?: SelectChaseOptions,
): ChaseSelection {
  if (!cards.length) {
    return { cards: [], mode: "priced", note: null };
  }

  const priced = cards
    .filter((c) => c.marketPrice !== null)
    .sort((a, b) => (b.marketPrice as number) - (a.marketPrice as number));

  if (priced.length >= MIN_PRICED_FOR_RANK) {
    const count = Math.max(1, Math.ceil(priced.length * 0.2));
    return {
      cards: priced.slice(0, count),
      mode: "priced",
      note: null,
    };
  }

  const categoryId = resolveCategoryId(cards, options?.categoryId);
  const scored = [...cards].sort((a, b) => {
    const diff =
      estimateChaseScore(b, categoryId) - estimateChaseScore(a, categoryId);
    if (diff !== 0) return diff;
    // Stable tie-break: higher collector number first, then name
    const an = parseSetNumber(a.number).num;
    const bn = parseSetNumber(b.number).num;
    if (an !== bn) return bn - an;
    return (a.name || "").localeCompare(b.name || "");
  });

  const count = Math.max(1, Math.ceil(cards.length * 0.2));
  return {
    cards: scored.slice(0, count),
    mode: "estimated",
    note: ESTIMATED_CHASE_NOTE,
  };
}

function resolveCategoryId(
  cards: CardWithPrice[],
  explicit?: string | null,
): string {
  if (explicit) return explicit;
  const setId = (cards[0]?.set?.id || cards[0]?.id || "").toLowerCase();
  if (setId.startsWith("op") || setId.includes("one-piece") || setId.includes("onepiece")) {
    return "one-piece";
  }
  return "pokemon";
}

/**
 * Heuristic chase score for unpriced / new sets.
 * Ranking only — does not assign marketPrice.
 */
export function estimateChaseScore(
  card: CardWithPrice,
  categoryId: string = "pokemon",
): number {
  if (categoryId === "one-piece") {
    return scoreOnePiece(card);
  }
  if (categoryId === "mtg") {
    return scoreMtg(card);
  }
  if (categoryId === "lorcana") {
    return scoreLorcana(card);
  }
  return scorePokemon(card);
}

function scorePokemon(card: CardWithPrice): number {
  let score = 0;
  const rarity = (card.rarity || "").toLowerCase();
  const name = (card.name || "").toLowerCase();
  const number = card.number || "";
  const numberUpper = number.toUpperCase();

  // High-value rarity strings (historical chase patterns)
  if (/special\s*illustration\s*rare|\bsir\b/.test(rarity)) score += 100;
  else if (/illustration\s*rare|\bir\b/.test(rarity)) score += 85;
  else if (/hyper\s*rare|rare\s*rainbow|rainbow\s*rare/.test(rarity)) score += 90;
  else if (/secret\s*rare|rare\s*secret/.test(rarity)) score += 80;
  else if (/amazing\s*rare/.test(rarity)) score += 70;
  else if (/ace\s*spec/.test(rarity) || /ace\s*spec/.test(name)) score += 75;
  else if (/ultra\s*rare/.test(rarity)) score += 55;
  else if (/trainer\s*gallery/.test(rarity) || /trainer\s*gallery/.test(name))
    score += 65;
  else if (/rare\s*holo\s*v|rare\s*holo\s*ex|double\s*rare/.test(rarity))
    score += 40;
  else if (/rare\s*holo|holo\s*rare/.test(rarity)) score += 25;
  else if (/rare/.test(rarity)) score += 10;

  if (/\bgold\b|\bhyper\b/.test(rarity)) score += 15;

  // Secret numbering: collector # above printed total
  const printed = card.set?.printedTotal ?? 0;
  const parsed = parseSetNumber(number);
  if (printed > 0 && Number.isFinite(parsed.num) && parsed.num > printed) {
    score += 50;
  }

  // Extra subsets often chase-heavy (Galarian Gallery, Trainer Gallery, etc.)
  if (/^(GG|TG)\d+/i.test(number) || /\b(GG|TG)\d+/i.test(numberUpper)) {
    score += 35;
  }
  if (/^SV\d+/i.test(number) || /sv\s*alt/i.test(name)) {
    score += 20;
  }

  // High collector numbers relative to set size (top of set)
  if (printed > 0 && parsed.num > 0) {
    const ratio = parsed.num / printed;
    if (ratio >= 0.95) score += 15;
    else if (ratio >= 0.85) score += 8;
  }

  return score;
}

function scoreMtg(card: CardWithPrice): number {
  let score = 0;
  const rarity = (card.rarity || "").toLowerCase();
  if (/mythic/.test(rarity)) score += 80;
  else if (/special/.test(rarity)) score += 60;
  else if (/rare/.test(rarity)) score += 40;
  else if (/uncommon/.test(rarity)) score += 10;
  return score;
}

function scoreLorcana(card: CardWithPrice): number {
  let score = 0;
  const rarity = (card.rarity || "").toLowerCase();

  if (/iconic/.test(rarity)) score += 100;
  else if (/enchanted/.test(rarity)) score += 90;
  else if (/epic/.test(rarity)) score += 75;
  else if (/legendary/.test(rarity)) score += 55;
  else if (/super\s*rare/.test(rarity)) score += 40;
  else if (/rare/.test(rarity)) score += 18;
  else if (/uncommon/.test(rarity)) score += 8;
  else if (/common/.test(rarity)) score += 2;

  const printed = card.set?.printedTotal ?? 0;
  const parsed = parseSetNumber(card.number || "");
  if (printed > 0 && parsed.num > printed) score += 45;

  return score;
}

function scoreOnePiece(card: CardWithPrice): number {
  let score = 0;
  const rarity = (card.rarity || "").toLowerCase();
  const name = (card.name || "").toLowerCase();
  const number = (card.number || "").toUpperCase();

  // Conservative chase-like rarities
  if (/\bsec\b|secret/.test(rarity) || /\bsec\b/.test(number)) score += 95;
  if (/\bsp\b|special\s*rare|super\s*parallel/.test(rarity) || /-SP\b/.test(number))
    score += 85;
  if (/manga/.test(rarity) || /manga/.test(name)) score += 90;
  if (/parallel/.test(rarity) || /parallel/.test(name)) score += 70;
  if (/leader/.test(rarity) && (/alt|parallel|special/.test(rarity) || /alt/.test(name)))
    score += 75;
  else if (/leader/.test(rarity)) score += 35;
  if (/super\s*rare|\bsr\b/.test(rarity)) score += 50;
  if (/rare/.test(rarity) && score < 20) score += 15;

  // Alt art / promo-ish naming
  if (/alt\s*art|alternate\s*art/.test(name) || /alt\s*art/.test(rarity)) {
    score += 40;
  }

  // High parallel / collector suffixes
  if (/[Pp]\d+$/.test(card.number || "") || /_p\d+/i.test(card.number || "")) {
    score += 25;
  }

  const printed = card.set?.printedTotal ?? 0;
  const parsed = parseSetNumber(card.number || "");
  if (printed > 0 && parsed.num > printed) score += 40;

  return score;
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
    return (a.number || "").localeCompare(b.number || "", undefined, {
      numeric: true,
    });
  });
}

function parseSetNumber(n: string | null | undefined): { prefix: string; num: number } {
  if (!n) return { prefix: "", num: Number.MAX_SAFE_INTEGER };
  const match = n.match(/^([A-Za-z]*)(\d+)/);
  if (!match) return { prefix: n, num: Number.MAX_SAFE_INTEGER };
  return { prefix: match[1] || "", num: parseInt(match[2], 10) };
}

/** Visible label so market prices are not read as tick-live. */
export function formatPricesAsOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `Prices as of ${formatted}`;
}

export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(value);
}

/** UI copy when marketPrice is null — never invent a dollar amount. */
export function formatPriceLabel(value: number | null): string {
  if (value === null) return "No price yet";
  return formatPrice(value);
}

export function formatVariant(variant: string | null): string {
  if (!variant) return "";
  return variant
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}
