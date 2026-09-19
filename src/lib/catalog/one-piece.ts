/**
 * One Piece English catalog adapter.
 *
 * Preferred upstream: OPTCG API (https://optcg-api.arjunbansal-ai.workers.dev)
 * when `OPTCG_API_KEY` is set (X-API-Key). Without a key that host returns 401
 * for /sets and /cards; /images/{card_id} is public.
 *
 * Working fallback (no key): https://optcgapi.com public JSON API — maps into
 * the shared PokemonSet / PokemonCard shapes used by ChaseApp.
 *
 * Prices: only use numeric USD fields from the API (never invent).
 * MoM: not available (no Cardmarket-style history) — callers should N/A MoM.
 */

import type { PokemonCard, PokemonSet } from "@/lib/types";

export const categoryId = "one-piece" as const;

export const OPTCG_BASE = "https://optcg-api.arjunbansal-ai.workers.dev";
const OPTCGAPI_SETS = "https://optcgapi.com/api/allSets/";
const OPTCGAPI_SET_CARDS = "https://optcgapi.com/api/sets";

export type OnePiecePriceBackend = "optcg" | "optcgapi";

export class OnePieceApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "OnePieceApiError";
    this.status = status;
  }
}

export { OnePieceApiError as CatalogApiError };

function getOptcgApiKey(): string | undefined {
  const key = process.env.OPTCG_API_KEY?.trim();
  return key || undefined;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  opts?: { retries?: number },
): Promise<{ data: T; status: number }> {
  const retries = opts?.retries ?? 3;
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      ...init,
      cache: "no-store",
    });
    lastStatus = res.status;
    lastBody = await res.text();

    if (res.status === 429) {
      throw new OnePieceApiError(
        "Rate limited by the One Piece card API. Try again shortly.",
        429,
      );
    }

    if (res.ok) {
      try {
        return { data: JSON.parse(lastBody) as T, status: res.status };
      } catch {
        throw new OnePieceApiError(
          "One Piece card API returned invalid JSON.",
          502,
        );
      }
    }

    if ((res.status >= 500 || res.status === 408) && attempt < retries) {
      await sleep(400 * attempt);
      continue;
    }
    break;
  }

  throw new OnePieceApiError(
    `One Piece card API error (${lastStatus || "network"}).`,
    lastStatus || 502,
  );
}

function imageUrlForCardId(cardId: string): string {
  // Public on the OPTCG worker (no API key required)
  return `${OPTCG_BASE}/images/${encodeURIComponent(cardId)}`;
}

function cardNumberFromId(cardSetId: string): string {
  // OP01-077 → 077; EB01-001 → 001
  const parts = cardSetId.split("-");
  if (parts.length >= 2) return parts[parts.length - 1] || cardSetId;
  return cardSetId;
}

/** Normalize OP14-EB04 → OP-14 (zero-padded). */
function formatOpStyleId(kind: string, num: number): string {
  const n = Number.isFinite(num) ? num : 0;
  const pad = n < 100 ? String(n).padStart(2, "0") : String(n);
  return `${kind.toUpperCase()}-${pad}`;
}

/**
 * Upstream optcgapi sometimes merges a booster + extra into one id (OP14-EB04).
 * Expand to the English booster id so the set picker stays OP-01…OP-N shaped.
 * EB half is not invented as a separate catalog row here (FLAG if missing).
 */
function normalizeOptcgapiSetId(rawId: string): string {
  const id = rawId.trim();
  const amalgam = id.match(/^OP(\d+)-EB(\d+)$/i);
  if (amalgam) {
    return formatOpStyleId("OP", parseInt(amalgam[1], 10));
  }
  return id;
}

/**
 * Card id prefixes that belong to a set. Null = do not filter.
 * OP-17 → OP17; EB-01 → EB01; PRB-01 → PRB01; OP14-EB04 → OP14 (+ optional EB04).
 */
function expectedCardPrefixes(setId: string): string[] | null {
  const raw = setId.trim();
  if (!raw) return null;

  const amalgam = raw.match(/^OP(\d+)-EB(\d+)$/i);
  if (amalgam) {
    return [
      `OP${String(parseInt(amalgam[1], 10)).padStart(2, "0")}`,
      `EB${String(parseInt(amalgam[2], 10)).padStart(2, "0")}`,
    ];
  }

  const simple = raw.match(/^(OP|EB|PRB|ST)-?(\d+)$/i);
  if (simple) {
    const kind = simple[1].toUpperCase();
    const num = parseInt(simple[2], 10);
    // Card ids use zero-padded forms (OP01-077, OP17-001) — never "OP1"
    const body = String(num).padStart(2, "0");
    return [`${kind}${body}`];
  }

  // Already compact e.g. OP17
  const compact = raw.match(/^(OP|EB|PRB|ST)(\d+)$/i);
  if (compact) {
    const kind = compact[1].toUpperCase();
    const num = parseInt(compact[2], 10);
    return [`${kind}${String(num).padStart(2, "0")}`];
  }

  return null;
}

function cardMatchesSet(cardId: string, setId: string): boolean {
  const prefixes = expectedCardPrefixes(setId);
  if (!prefixes || prefixes.length === 0) return true;
  const id = cardId.trim().toUpperCase();
  return prefixes.some((p) => {
    const pref = p.toUpperCase();
    // Require boundary after prefix so OP01 does not match OP010… and OP1≠OP17
    return id === pref || id.startsWith(`${pref}-`);
  });
}

/** Upstream path slugs to try for a logical set id. */
function optcgapiSlugsForSet(setId: string): string[] {
  const raw = setId.trim();
  const slugs = new Set<string>();
  slugs.add(raw.toLowerCase());
  slugs.add(raw.replace(/-/g, "").toLowerCase());

  const simple = raw.match(/^OP-?(\d+)$/i);
  if (simple) {
    const n = parseInt(simple[1], 10);
    const pad = String(n).padStart(2, "0");
    // Amalgamated upstream ids observed: OP14-EB04, OP15-EB04
    slugs.add(`op${pad}-eb04`);
    slugs.add(`op${n}-eb04`);
  }
  return [...slugs];
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

type OptcgapiSetRow = {
  set_id?: string;
  set_name?: string;
};

type OptcgapiCardRow = {
  card_set_id?: string;
  card_name?: string;
  set_id?: string;
  set_name?: string;
  rarity?: string | null;
  market_price?: number | string | null;
  inventory_price?: number | string | null;
  card_image?: string | null;
  date_scraped?: string | null;
};

type OptcgSetRow = {
  id?: string;
  set_id?: string;
  name?: string;
  set_name?: string;
  releaseDate?: string | null;
  release_date?: string | null;
  total?: number;
  printedTotal?: number;
  series?: string;
};

type OptcgCardRow = {
  id?: string;
  card_id?: string;
  name?: string;
  card_name?: string;
  number?: string;
  rarity?: string | null;
  price?: number | string | null;
  market_price?: number | string | null;
  image?: string | null;
  image_url?: string | null;
  images?: { small?: string; large?: string };
  set?: { id?: string; name?: string; printedTotal?: number; total?: number };
  set_id?: string;
  set_name?: string;
};

function unwrapArray<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "sets", "cards", "results"]) {
      if (Array.isArray(obj[key])) return obj[key] as T[];
    }
  }
  return [];
}

function mapOptcgapiSet(row: OptcgapiSetRow): PokemonSet | null {
  const rawId = (row.set_id || "").trim();
  const name = (row.set_name || "").trim();
  if (!rawId || !name) return null;
  const id = normalizeOptcgapiSetId(rawId);
  return {
    id,
    name,
    series: "One Piece English",
    printedTotal: 0,
    total: 0,
    releaseDate: "",
  };
}

function mapOptcgSet(row: OptcgSetRow): PokemonSet | null {
  const id = (row.id || row.set_id || "").trim();
  const name = (row.name || row.set_name || "").trim();
  if (!id || !name) return null;
  const release =
    (row.releaseDate || row.release_date || "").toString().trim() || "";
  return {
    id,
    name,
    series: row.series?.trim() || "One Piece English",
    printedTotal: typeof row.printedTotal === "number" ? row.printedTotal : 0,
    total: typeof row.total === "number" ? row.total : 0,
    releaseDate: release,
  };
}

function mapCardToShared(input: {
  id: string;
  name: string;
  number: string;
  rarity?: string | null;
  setId: string;
  setName: string;
  printedTotal: number;
  imageSmall: string;
  imageLarge: string;
  marketPrice: number | null;
  priceUpdatedAt: string | null;
}): PokemonCard {
  const card: PokemonCard = {
    id: input.id,
    name: input.name,
    number: input.number,
    rarity: input.rarity || undefined,
    images: {
      small: input.imageSmall,
      large: input.imageLarge,
    },
    set: {
      id: input.setId,
      name: input.setName,
      printedTotal: input.printedTotal,
      total: input.printedTotal,
    },
  };

  if (input.marketPrice !== null) {
    card.tcgplayer = {
      updatedAt: input.priceUpdatedAt || undefined,
      prices: {
        // Shape reused by enrichCard — single "market" variant
        market: { market: input.marketPrice },
      },
    };
  }

  return card;
}

async function fetchSetsFromOptcg(apiKey: string): Promise<PokemonSet[]> {
  const { data } = await fetchJson<unknown>(`${OPTCG_BASE}/sets`, {
    headers: {
      Accept: "application/json",
      "X-API-Key": apiKey,
    },
  });
  const rows = unwrapArray<OptcgSetRow>(data);
  const mapped = rows.map(mapOptcgSet).filter((s): s is PokemonSet => Boolean(s));
  if (mapped.length === 0) {
    throw new OnePieceApiError("OPTCG /sets returned no usable sets.", 502);
  }
  return mapped;
}

async function fetchCardsFromOptcg(
  apiKey: string,
  setId: string,
): Promise<PokemonCard[]> {
  // Documented shape: GET /sets/{id}/cards — also try /cards?set_id=
  const headers = {
    Accept: "application/json",
    "X-API-Key": apiKey,
  };

  let data: unknown = null;
  let lastErr: OnePieceApiError | null = null;

  for (const url of [
    `${OPTCG_BASE}/sets/${encodeURIComponent(setId)}/cards`,
    `${OPTCG_BASE}/cards?set_id=${encodeURIComponent(setId)}`,
  ]) {
    try {
      const result = await fetchJson<unknown>(url, { headers });
      data = result.data;
      break;
    } catch (err) {
      if (err instanceof OnePieceApiError) {
        lastErr = err;
        if (err.status === 401 || err.status === 403) throw err;
        continue;
      }
      throw err;
    }
  }

  if (data == null) {
    throw (
      lastErr ||
      new OnePieceApiError(`OPTCG cards for set ${setId} failed.`, 502)
    );
  }

  const rows = unwrapArray<OptcgCardRow>(data);
  const cards: PokemonCard[] = [];

  for (const row of rows) {
    const id = (row.id || row.card_id || "").trim();
    const name = (row.name || row.card_name || "").trim();
    if (!id || !name) continue;

    const number =
      (row.number || "").trim() || cardNumberFromId(id);
    const price =
      asFinitePrice(row.price) ?? asFinitePrice(row.market_price);
    const imgFromFields =
      row.images?.large ||
      row.images?.small ||
      row.image_url ||
      row.image ||
      "";
    const image = imgFromFields || imageUrlForCardId(id);
    const setName =
      row.set?.name || row.set_name || setId;
    const resolvedSetId = row.set?.id || row.set_id || setId;

    cards.push(
      mapCardToShared({
        id,
        name,
        number,
        rarity: row.rarity,
        setId: resolvedSetId,
        setName,
        printedTotal: row.set?.printedTotal || row.set?.total || rows.length,
        imageSmall: image,
        imageLarge: image,
        marketPrice: price,
        priceUpdatedAt: null,
      }),
    );
  }

  // Drop cross-set bleed, then fix printedTotal from cardinality
  const filtered = cards.filter((c) => cardMatchesSet(c.id, setId));
  const total = filtered.length;
  return filtered.map((c) => ({
    ...c,
    set: { ...c.set, id: setId, printedTotal: total, total },
  }));
}

async function fetchSetsFromOptcgapi(): Promise<PokemonSet[]> {
  const { data } = await fetchJson<unknown>(OPTCGAPI_SETS, {
    headers: { Accept: "application/json" },
  });
  const rows = unwrapArray<OptcgapiSetRow>(data);
  const mapped = rows
    .map(mapOptcgapiSet)
    .filter((s): s is PokemonSet => Boolean(s));
  // Dedupe by id (amalgamated rows may collapse to same OP-##)
  const seen = new Set<string>();
  const deduped: PokemonSet[] = [];
  for (const s of mapped) {
    const key = s.id.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(s);
  }
  if (deduped.length === 0) {
    throw new OnePieceApiError(
      "optcgapi.com returned no One Piece sets.",
      502,
    );
  }
  return deduped;
}

async function fetchCardsFromOptcgapi(setId: string): Promise<PokemonCard[]> {
  // Public API uses lowercase path segment, e.g. /api/sets/op-01/
  // Also try amalgamated slugs (op14-eb04) when OP-14 is requested.
  let rows: OptcgapiCardRow[] = [];
  let lastErr: OnePieceApiError | null = null;

  for (const slug of optcgapiSlugsForSet(setId)) {
    const url = `${OPTCGAPI_SET_CARDS}/${encodeURIComponent(slug)}/`;
    try {
      const { data } = await fetchJson<unknown>(url, {
        headers: { Accept: "application/json" },
      });
      const got = unwrapArray<OptcgapiCardRow>(data);
      if (got.length > 0) {
        rows = got;
        break;
      }
    } catch (err) {
      if (err instanceof OnePieceApiError) {
        lastErr = err;
        if (err.status === 429) throw err;
        continue;
      }
      throw err;
    }
  }

  if (rows.length === 0) {
    if (lastErr) throw lastErr;
    return [];
  }

  const setName = (rows[0]?.set_name || setId).trim();
  const cards: PokemonCard[] = [];

  for (const row of rows) {
    const id = (row.card_set_id || "").trim();
    const name = (row.card_name || "").trim();
    if (!id || !name) continue;
    // Drop cross-set bleed (e.g. EB04 SP rows inside OP-17 payload)
    if (!cardMatchesSet(id, setId)) continue;

    const market =
      asFinitePrice(row.market_price) ?? asFinitePrice(row.inventory_price);
    const workerImg = imageUrlForCardId(id);
    const fallbackImg = (row.card_image || "").trim();
    // Prefer public OPTCG worker images; fall back to optcgapi CDN
    const image = workerImg || fallbackImg;

    cards.push(
      mapCardToShared({
        id,
        name,
        number: cardNumberFromId(id),
        rarity: row.rarity,
        setId,
        setName,
        printedTotal: 0, // fixed below from filtered length
        imageSmall: image,
        imageLarge: image,
        marketPrice: market,
        priceUpdatedAt: row.date_scraped || null,
      }),
    );
  }

  const total = cards.length;
  return cards.map((c) => ({
    ...c,
    set: { ...c.set, id: setId, printedTotal: total, total },
  }));
}

export type OnePieceFetchMeta = {
  priceBackend: OnePiecePriceBackend;
  /** True when OPTCG key was present and used successfully */
  usedOptcgKey: boolean;
};

/**
 * Fetch set list. Tries OPTCG with key first; falls back to optcgapi.com.
 */
export async function fetchSets(): Promise<PokemonSet[]> {
  const key = getOptcgApiKey();
  if (key) {
    try {
      return await fetchSetsFromOptcg(key);
    } catch (err) {
      console.warn(
        "OPTCG /sets failed; falling back to optcgapi.com:",
        err instanceof Error ? err.message : err,
      );
    }
  }
  return fetchSetsFromOptcgapi();
}

/**
 * Fetch cards for a set. Tries OPTCG with key first; falls back to optcgapi.com.
 */
export async function fetchCards(
  setId: string,
): Promise<{ cards: PokemonCard[]; meta: OnePieceFetchMeta }> {
  const key = getOptcgApiKey();
  if (key) {
    try {
      const cards = await fetchCardsFromOptcg(key, setId);
      return {
        cards,
        meta: { priceBackend: "optcg", usedOptcgKey: true },
      };
    } catch (err) {
      console.warn(
        `OPTCG cards for ${setId} failed; falling back to optcgapi.com:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const cards = await fetchCardsFromOptcgapi(setId);
  return {
    cards,
    meta: { priceBackend: "optcgapi", usedOptcgKey: false },
  };
}
