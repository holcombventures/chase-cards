/**
 * Magic: The Gathering English catalog adapter.
 *
 * Upstream: Scryfall public API (https://api.scryfall.com) — keyless, no secret.
 * Sets: GET /sets (paper products; tokens / memorabilia / minigames / vanguard omitted).
 * Cards: set search with `lang:en` (English printings only).
 * Art: Scryfall `image_uris` (front face when the card is double-faced).
 * Prices: USD fields Scryfall actually returns (`usd`, `usd_foil`, `usd_etched`).
 * Never invent a price. MoM is N/A (no Cardmarket-style history).
 * Category status is live. Sports stays coming_soon.
 */

import type { PokemonCard, PokemonSet } from "@/lib/types";

export const categoryId = "mtg" as const;

export const SCRYFALL_BASE = "https://api.scryfall.com";

const USER_AGENT =
  "ChaseCards/1.0 (MTG English catalog; +https://github.com/holcombventures/chase-cards)";

/** Not chase product sets. Digital-only sets are skipped separately (no paper USD). */
const SKIP_SET_TYPES = new Set([
  "token",
  "memorabilia",
  "minigame",
  "vanguard",
]);

export type MtgPriceBackend = "scryfall";

export type MtgFetchMeta = {
  priceBackend: MtgPriceBackend;
};

export class MtgApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "MtgApiError";
    this.status = status;
  }
}

export { MtgApiError as CatalogApiError };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asFinitePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return null;
}

type ScryfallList<T> = {
  object?: string;
  has_more?: boolean;
  next_page?: string | null;
  data?: T[];
};

type ScryfallSet = {
  object?: string;
  code?: string;
  name?: string;
  set_type?: string;
  released_at?: string | null;
  card_count?: number;
  printed_size?: number | null;
  digital?: boolean;
  block?: string | null;
  icon_svg_uri?: string | null;
};

type ScryfallImageUris = {
  small?: string;
  normal?: string;
  large?: string;
  png?: string;
};

type ScryfallCard = {
  id?: string;
  name?: string;
  lang?: string;
  set?: string;
  set_name?: string;
  collector_number?: string;
  rarity?: string | null;
  image_uris?: ScryfallImageUris | null;
  card_faces?: Array<{ image_uris?: ScryfallImageUris | null }> | null;
  prices?: {
    usd?: string | null;
    usd_foil?: string | null;
    usd_etched?: string | null;
  } | null;
};

const USD_PRICE_FIELDS = [
  ["usd", "nonfoil"],
  ["usd_foil", "foil"],
  ["usd_etched", "etched"],
] as const;

async function fetchJson<T>(url: string): Promise<T> {
  const retries = 3;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
        },
        cache: "no-store",
      });
    } catch {
      if (attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }
      throw new MtgApiError("Scryfall API error (network).", 502);
    }

    lastStatus = res.status;
    const body = await res.text();

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get("retry-after"));
      if (attempt < retries) {
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 500 * attempt,
        );
        continue;
      }
      throw new MtgApiError(
        "Rate limited by Scryfall. Try again shortly.",
        429,
      );
    }

    if (res.status === 404) {
      throw new MtgApiError("Scryfall found no matching MTG data.", 404);
    }

    if (res.ok) {
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new MtgApiError("Scryfall returned invalid JSON.", 502);
      }
    }

    if ((res.status >= 500 || res.status === 408) && attempt < retries) {
      await sleep(400 * attempt);
      continue;
    }
    break;
  }

  throw new MtgApiError(
    `Scryfall API error (${lastStatus || "network"}).`,
    lastStatus || 502,
  );
}

function seriesLabel(row: ScryfallSet): string {
  const block = row.block?.trim();
  if (block) return block;
  const raw = (row.set_type || "").trim();
  if (!raw) return "Magic: The Gathering";
  return raw
    .split("_")
    .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
    .join(" ");
}

function mapSet(row: ScryfallSet): PokemonSet | null {
  if (row.digital) return null;
  const setType = (row.set_type || "").trim().toLowerCase();
  if (SKIP_SET_TYPES.has(setType)) return null;

  const id = (row.code || "").trim().toLowerCase();
  const name = (row.name || "").trim();
  if (!id || !name) return null;

  const printed =
    typeof row.printed_size === "number" && row.printed_size > 0
      ? row.printed_size
      : typeof row.card_count === "number"
        ? row.card_count
        : 0;
  const total =
    typeof row.card_count === "number" && row.card_count > 0
      ? row.card_count
      : printed;
  const symbol = (row.icon_svg_uri || "").trim();

  return {
    id,
    name,
    series: seriesLabel(row),
    printedTotal: printed,
    total,
    releaseDate: (row.released_at || "").trim(),
    images: symbol ? { symbol } : undefined,
  };
}

function httpsUrl(value: string | undefined): string {
  const url = (value || "").trim();
  return url.startsWith("https://") ? url : "";
}

function pickImages(
  card: ScryfallCard,
): { small: string; large: string } | null {
  const uris =
    card.image_uris ||
    card.card_faces?.find((face) => face.image_uris)?.image_uris ||
    null;
  if (!uris) return null;
  const small =
    httpsUrl(uris.small) ||
    httpsUrl(uris.normal) ||
    httpsUrl(uris.large) ||
    httpsUrl(uris.png);
  const large =
    httpsUrl(uris.large) ||
    httpsUrl(uris.png) ||
    httpsUrl(uris.normal) ||
    httpsUrl(uris.small);
  if (!small && !large) return null;
  return { small: small || large, large: large || small };
}

function mapUsdPrices(
  prices: ScryfallCard["prices"],
): Record<string, { market: number }> | null {
  if (!prices) return null;
  const out: Record<string, { market: number }> = {};
  for (const [field, variant] of USD_PRICE_FIELDS) {
    const market = asFinitePrice(prices[field]);
    if (market === null) continue;
    out[variant] = { market };
  }
  return Object.keys(out).length > 0 ? out : null;
}

function mapCard(row: ScryfallCard, setId: string, setName: string): PokemonCard | null {
  const id = (row.id || "").trim();
  const name = (row.name || "").trim();
  if (!id || !name) return null;
  if ((row.lang || "").toLowerCase() !== "en") return null;
  if ((row.set || "").trim().toLowerCase() !== setId) return null;

  const images = pickImages(row);
  if (!images) return null;

  const card: PokemonCard = {
    id,
    name,
    number: (row.collector_number || "").trim(),
    rarity: row.rarity || undefined,
    images,
    set: {
      id: setId,
      name: setName,
      printedTotal: 0,
      total: 0,
    },
  };

  const prices = mapUsdPrices(row.prices);
  if (prices) {
    card.tcgplayer = { prices };
  }
  return card;
}

function englishCardsUrl(code: string): string {
  const q = `e:${code} lang:en`;
  const params = new URLSearchParams({
    include_extras: "true",
    include_variations: "true",
    order: "set",
    unique: "prints",
    q,
  });
  return `${SCRYFALL_BASE}/cards/search?${params.toString()}`;
}

async function fetchEnglishPrintings(code: string): Promise<ScryfallCard[]> {
  const cards: ScryfallCard[] = [];
  let url: string | null = englishCardsUrl(code);
  let page = 0;

  while (url) {
    if (page > 0) await sleep(80);
    page += 1;
    if (page > 60) {
      throw new MtgApiError(
        `Scryfall card list for ${code} exceeded the page cap.`,
        502,
      );
    }

    let list: ScryfallList<ScryfallCard>;
    try {
      list = await fetchJson<ScryfallList<ScryfallCard>>(url);
    } catch (err) {
      if (err instanceof MtgApiError && err.status === 404 && page === 1) {
        return [];
      }
      throw err;
    }

    if (Array.isArray(list.data)) cards.push(...list.data);
    url = list.has_more && list.next_page ? list.next_page : null;
  }

  return cards;
}

/**
 * English paper sets. Scryfall is keyless; one GET /sets.
 */
export async function fetchSets(): Promise<PokemonSet[]> {
  const list = await fetchJson<ScryfallList<ScryfallSet>>(
    `${SCRYFALL_BASE}/sets`,
  );
  const rows = Array.isArray(list.data) ? list.data : [];
  const seen = new Set<string>();
  const sets: PokemonSet[] = [];

  for (const row of rows) {
    const mapped = mapSet(row);
    if (!mapped || seen.has(mapped.id)) continue;
    seen.add(mapped.id);
    sets.push(mapped);
  }

  if (sets.length === 0) {
    throw new MtgApiError("Scryfall returned no English MTG sets.", 502);
  }
  return sets;
}

/**
 * English cards for a set code (e.g. `mh3`). Prices only when Scryfall sends USD.
 */
export async function fetchCards(
  setId: string,
): Promise<{ cards: PokemonCard[]; meta: MtgFetchMeta }> {
  const code = setId.trim().toLowerCase();
  if (!/^[a-z0-9]{2,10}$/.test(code)) {
    throw new MtgApiError("Invalid MTG set code.", 400);
  }

  const set = await fetchJson<ScryfallSet>(
    `${SCRYFALL_BASE}/sets/${encodeURIComponent(code)}`,
  );
  const setName = (set.name || code).trim();
  const printedSize =
    typeof set.printed_size === "number" && set.printed_size > 0
      ? set.printed_size
      : 0;

  await sleep(80);
  const rows = await fetchEnglishPrintings(code);
  const cards: PokemonCard[] = [];
  for (const row of rows) {
    const mapped = mapCard(row, code, setName);
    if (mapped) cards.push(mapped);
  }

  const total = cards.length;
  const printedTotal = printedSize > 0 ? printedSize : total;
  return {
    cards: cards.map((card) => ({
      ...card,
      set: {
        id: code,
        name: setName,
        printedTotal,
        total,
      },
    })),
    meta: { priceBackend: "scryfall" },
  };
}
