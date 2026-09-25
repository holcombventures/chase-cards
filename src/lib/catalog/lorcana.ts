/**
 * Disney Lorcana catalog adapter.
 *
 * Upstream: TCGCSV (https://tcgcsv.com), a keyless daily mirror of TCGplayer.
 * Lorcana is TCGplayer category 71. Server-side only (the host does not send
 * CORS headers). Data refreshes about once a day, so callers keep a 24h price
 * snapshot and this module spaces requests and sends a custom User-Agent.
 *
 * Singles are products with a Number extended-data field. Sealed products and
 * inserts are dropped. Prices join on productId; marketPrice is the only
 * figure used. Normal and Cold Foil are subtypes of one product. A separate
 * "(Foil)" product that shares the collector number is merged onto that card
 * and the higher market price wins.
 *
 * Main numbered sets only. Promo groups (D23, DLPC, D100) and Illumineer's
 * Quest are omitted. Groups with no singles (upcoming sealed-only lists) are
 * omitted. There is no price-history archive, so month-over-month is N/A.
 *
 * Lorcana stays free. Ravensburger's fan-content policy does not allow
 * charging for access to Lorcana content.
 */

import type { PokemonCard, PokemonSet } from "@/lib/types";

export const categoryId = "lorcana" as const;

export const TCGCSV_BASE = "https://tcgcsv.com";
export const TCGCSV_CATEGORY_ID = 71;

export const USER_AGENT =
  "ChaseCards/1.0 (Disney Lorcana fan catalog; +https://chasecards.online)";

/** Minimum gap between TCGCSV request starts. */
const REQUEST_GAP_MS = 200;

const FAN_PRICE_BACKEND = "tcgcsv" as const;

export type LorcanaPriceBackend = typeof FAN_PRICE_BACKEND;

export type LorcanaFetchMeta = {
  priceBackend: LorcanaPriceBackend;
};

export class LorcanaApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "LorcanaApiError";
    this.status = status;
  }
}

export { LorcanaApiError as CatalogApiError };

export type TcgcsvGroup = {
  groupId: number;
  name: string;
  abbreviation: string;
  publishedOn?: string | null;
  modifiedOn?: string | null;
};

export type TcgcsvExtendedData = {
  name?: string | null;
  value?: string | null;
};

export type TcgcsvProduct = {
  productId: number;
  name?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  extendedData?: TcgcsvExtendedData[] | null;
};

export type TcgcsvPriceRow = {
  productId: number;
  marketPrice?: number | null;
  subTypeName?: string | null;
};

type GroupsCache = {
  token: string;
  groups: TcgcsvGroup[];
};

type SetsCache = {
  token: string;
  sets: PokemonSet[];
};

let groupsCache: GroupsCache | null = null;
let setsCache: SetsCache | null = null;
let nextRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Space out upstream calls even when a few are in flight. */
async function paceRequest(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt);
  nextRequestAt = startAt + REQUEST_GAP_MS;
  const wait = startAt - now;
  if (wait > 0) await sleep(wait);
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

function unwrapResults<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (payload && typeof payload === "object") {
    const results = (payload as { results?: unknown }).results;
    if (Array.isArray(results)) return results as T[];
  }
  return [];
}

async function fetchUpstream(url: string): Promise<{ status: number; body: string }> {
  await paceRequest();
  const retries = 3;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain;q=0.9",
          "User-Agent": USER_AGENT,
        },
        cache: "no-store",
      });
    } catch {
      if (attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }
      throw new LorcanaApiError("Lorcana card API error (network).", 502);
    }

    lastStatus = res.status;
    const body = await res.text();

    if (res.status === 429) {
      if (attempt < retries) {
        await sleep(500 * attempt);
        continue;
      }
      throw new LorcanaApiError(
        "Rate limited by the Lorcana card API. Try again shortly.",
        429,
      );
    }

    if (res.ok) return { status: res.status, body };

    if ((res.status >= 500 || res.status === 408) && attempt < retries) {
      await sleep(400 * attempt);
      continue;
    }

    return { status: res.status, body };
  }

  throw new LorcanaApiError(
    `Lorcana card API error (${lastStatus || "network"}).`,
    lastStatus || 502,
  );
}

async function fetchJson<T>(url: string): Promise<T> {
  const { status, body } = await fetchUpstream(url);
  if (status < 200 || status >= 300) {
    throw new LorcanaApiError(`Lorcana card API error (${status}).`, status === 404 ? 404 : 502);
  }
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new LorcanaApiError("Lorcana card API returned invalid JSON.", 502);
  }
}

/** Daily mirror timestamp. Null when the endpoint is unreachable. */
export async function fetchTcgcsvLastUpdated(): Promise<string | null> {
  try {
    const { status, body } = await fetchUpstream(`${TCGCSV_BASE}/last-updated.txt`);
    if (status < 200 || status >= 300) return null;
    const token = body.trim();
    return token || null;
  } catch {
    return null;
  }
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Main sets use a numeric abbreviation (1, 2, … 13). Promos and quests do not. */
export function isMainNumberedGroup(group: TcgcsvGroup): boolean {
  return /^\d+$/.test((group.abbreviation || "").trim());
}

/** publishedOn is a date (no reliable offset). Future dates stay hidden. */
export function isReleasedGroup(group: TcgcsvGroup, now: Date = new Date()): boolean {
  const day = (group.publishedOn || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day <= utcDay(now);
}

export function extendedValue(
  product: TcgcsvProduct,
  field: string,
): string | null {
  const want = field.toLowerCase();
  for (const row of product.extendedData || []) {
    if ((row.name || "").trim().toLowerCase() !== want) continue;
    const value = (row.value || "").trim();
    if (value) return value;
  }
  return null;
}

/** Singles carry a collector Number. Sealed product and inserts do not. */
export function productIsSingle(product: TcgcsvProduct): boolean {
  return Boolean(extendedValue(product, "Number"));
}

export function parseCollectorNumber(
  raw: string,
): { number: string; printedTotal: number } | null {
  const text = raw.trim();
  const slashed = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slashed) {
    const printedTotal = parseInt(slashed[2], 10);
    if (!Number.isFinite(printedTotal) || printedTotal <= 0) return null;
    return { number: slashed[1], printedTotal };
  }
  const plain = text.match(/^(\d+)$/);
  if (plain) return { number: plain[1], printedTotal: 0 };
  return null;
}

const FOIL_PRODUCT_SUFFIX = /\s+\(foil\)\s*$/i;

/** "(Foil)" is a separate TCGplayer SKU, not part of the card title. */
export function displayCardName(name: string): string {
  return name.replace(FOIL_PRODUCT_SUFFIX, "").trim();
}

export function isFoilSkuName(name: string): boolean {
  return FOIL_PRODUCT_SUFFIX.test(name);
}

export function tcgplayerImageUrls(
  productId: number,
  imageUrl?: string | null,
): { small: string; large: string } {
  const fallbackSmall = `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_200w.jpg`;
  const small = (imageUrl || "").trim() || fallbackSmall;
  return {
    small,
    large: `https://tcgplayer-cdn.tcgplayer.com/product/${productId}_in_1000x1000.jpg`,
  };
}

export function selectLorcanaGroups(
  groups: readonly TcgcsvGroup[],
  options?: {
    now?: Date;
    /**
     * When provided, a group is kept only when this map says it has singles.
     * Upcoming sealed-only groups (no Number field) are dropped.
     */
    singlesByGroupId?: ReadonlyMap<number, boolean>;
  },
): TcgcsvGroup[] {
  const now = options?.now ?? new Date();
  const singles = options?.singlesByGroupId;
  return groups.filter((group) => {
    if (!group || !Number.isFinite(group.groupId)) return false;
    if (!(group.name || "").trim()) return false;
    if (!isMainNumberedGroup(group)) return false;
    if (!isReleasedGroup(group, now)) return false;
    if (singles && singles.get(group.groupId) !== true) return false;
    return true;
  });
}

export function groupToSet(group: TcgcsvGroup): PokemonSet {
  const abbreviation = (group.abbreviation || "").trim();
  const release = (group.publishedOn || "").trim().slice(0, 10);
  return {
    id: String(group.groupId),
    name: (group.name || "").trim(),
    series: abbreviation ? `Set ${abbreviation}` : "Disney Lorcana",
    printedTotal: 0,
    total: 0,
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(release) ? release : "",
  };
}

export function sortLorcanaSets(sets: readonly PokemonSet[]): PokemonSet[] {
  return [...sets].sort((a, b) => {
    const byDate = (b.releaseDate || "").localeCompare(a.releaseDate || "");
    if (byDate !== 0) return byDate;
    return (a.name || "").localeCompare(b.name || "");
  });
}

type BestMarket = {
  marketPrice: number;
  variant: string;
};

function bestMarket(rows: readonly TcgcsvPriceRow[]): BestMarket | null {
  let best: BestMarket | null = null;
  for (const row of rows) {
    const marketPrice = asFinitePrice(row.marketPrice);
    if (marketPrice === null) continue;
    if (!best || marketPrice > best.marketPrice) {
      best = {
        marketPrice,
        variant: (row.subTypeName || "").trim() || "market",
      };
    }
  }
  return best;
}

type SingleDraft = {
  product: TcgcsvProduct;
  number: string;
  printedTotal: number;
  numberKey: string;
  displayName: string;
  rarity: string | null;
  foilSku: boolean;
  best: BestMarket | null;
};

/**
 * Join products to prices and collapse "(Foil)" SKUs that share a collector
 * number into one card. The higher marketPrice wins; the title drops "(Foil)".
 * Enchanted / Epic / Iconic stay separate because they have their own numbers.
 */
export function buildLorcanaCards(input: {
  group: TcgcsvGroup;
  products: readonly TcgcsvProduct[];
  prices: readonly TcgcsvPriceRow[];
}): PokemonCard[] {
  const pricesByProduct = new Map<number, TcgcsvPriceRow[]>();
  for (const row of input.prices) {
    if (!Number.isFinite(row.productId)) continue;
    const list = pricesByProduct.get(row.productId) || [];
    list.push(row);
    pricesByProduct.set(row.productId, list);
  }

  const drafts: SingleDraft[] = [];
  for (const product of input.products) {
    if (!product || !Number.isFinite(product.productId)) continue;
    if (!productIsSingle(product)) continue;
    const rawNumber = extendedValue(product, "Number");
    if (!rawNumber) continue;
    const parsed = parseCollectorNumber(rawNumber);
    if (!parsed) continue;
    const rawName = (product.name || "").trim();
    if (!rawName) continue;
    const displayName = displayCardName(rawName);
    if (!displayName) continue;
    drafts.push({
      product,
      number: parsed.number,
      printedTotal: parsed.printedTotal,
      numberKey: `${parsed.number}/${parsed.printedTotal}`,
      displayName,
      rarity: extendedValue(product, "Rarity"),
      foilSku: isFoilSkuName(rawName),
      best: bestMarket(pricesByProduct.get(product.productId) || []),
    });
  }

  const grouped = new Map<string, SingleDraft[]>();
  for (const draft of drafts) {
    const key = `${draft.numberKey}::${draft.displayName.toLowerCase()}`;
    const list = grouped.get(key) || [];
    list.push(draft);
    grouped.set(key, list);
  }

  const setId = String(input.group.groupId);
  const setName = (input.group.name || "").trim() || setId;
  const cards: PokemonCard[] = [];

  for (const list of grouped.values()) {
    const base = list.find((draft) => !draft.foilSku) || list[0];
    let winner = base;
    for (const draft of list) {
      const winnerPrice = winner.best?.marketPrice ?? -1;
      const nextPrice = draft.best?.marketPrice ?? -1;
      if (nextPrice > winnerPrice) winner = draft;
    }

    const printedTotal = base.printedTotal || winner.printedTotal;
    const images = tcgplayerImageUrls(
      winner.product.productId,
      winner.product.imageUrl,
    );
    const card: PokemonCard = {
      id: `lorcana-${setId}-${base.product.productId}`,
      name: base.displayName,
      number: base.number,
      rarity: base.rarity || winner.rarity || undefined,
      images,
      set: {
        id: setId,
        name: setName,
        printedTotal,
        total: 0,
      },
    };

    if (winner.best) {
      const source = winner.product;
      card.tcgplayer = {
        url: (source.url || "").trim() || undefined,
        prices: {
          [winner.best.variant]: { market: winner.best.marketPrice },
        },
      };
    }

    cards.push(card);
  }

  const printedMode = modePrintedTotal(cards);
  const total = cards.length;
  return cards
    .map((card) => ({
      ...card,
      set: {
        ...card.set,
        printedTotal: card.set.printedTotal > 0 ? card.set.printedTotal : printedMode,
        total,
      },
    }))
    .sort((a, b) => {
      const an = parseInt(a.number, 10);
      const bn = parseInt(b.number, 10);
      if (an !== bn) return an - bn;
      return a.name.localeCompare(b.name);
    });
}

function modePrintedTotal(cards: readonly PokemonCard[]): number {
  const counts = new Map<number, number>();
  for (const card of cards) {
    const printed = card.set.printedTotal;
    if (!(printed > 0)) continue;
    counts.set(printed, (counts.get(printed) || 0) + 1);
  }
  let best = 0;
  let bestCount = 0;
  for (const [printed, count] of counts) {
    if (count > bestCount) {
      best = printed;
      bestCount = count;
    }
  }
  return best;
}

function normalizeGroup(raw: unknown): TcgcsvGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<TcgcsvGroup>;
  const groupId = typeof row.groupId === "number" ? row.groupId : Number(row.groupId);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const abbreviation =
    typeof row.abbreviation === "string" ? row.abbreviation.trim() : "";
  if (!Number.isFinite(groupId) || !name) return null;
  return {
    groupId,
    name,
    abbreviation,
    publishedOn: typeof row.publishedOn === "string" ? row.publishedOn : null,
    modifiedOn: typeof row.modifiedOn === "string" ? row.modifiedOn : null,
  };
}

async function loadGroups(token: string): Promise<TcgcsvGroup[]> {
  if (groupsCache && groupsCache.token === token) return groupsCache.groups;
  const payload = await fetchJson<unknown>(
    `${TCGCSV_BASE}/tcgplayer/${TCGCSV_CATEGORY_ID}/groups`,
  );
  const groups = unwrapResults<unknown>(payload)
    .map(normalizeGroup)
    .filter((group): group is TcgcsvGroup => Boolean(group));
  if (groups.length === 0) {
    throw new LorcanaApiError("TCGCSV returned no Lorcana groups.", 502);
  }
  groupsCache = { token, groups };
  return groups;
}

async function loadProducts(groupId: number): Promise<TcgcsvProduct[]> {
  const payload = await fetchJson<unknown>(
    `${TCGCSV_BASE}/tcgplayer/${TCGCSV_CATEGORY_ID}/${groupId}/products`,
  );
  return unwrapResults<TcgcsvProduct>(payload);
}

async function loadPrices(groupId: number): Promise<TcgcsvPriceRow[]> {
  const payload = await fetchJson<unknown>(
    `${TCGCSV_BASE}/tcgplayer/${TCGCSV_CATEGORY_ID}/${groupId}/prices`,
  );
  return unwrapResults<TcgcsvPriceRow>(payload);
}

function cacheToken(lastUpdated: string | null, now: Date): string {
  if (lastUpdated) return lastUpdated;
  // Hour bucket when the daily stamp is unreachable, so a bad probe
  // does not refetch the whole category on every request.
  return `unchecked:${now.toISOString().slice(0, 13)}`;
}

export async function fetchSets(now: Date = new Date()): Promise<PokemonSet[]> {
  const lastUpdated = await fetchTcgcsvLastUpdated();
  const token = cacheToken(lastUpdated, now);
  if (setsCache && setsCache.token === token) return setsCache.sets;

  const groups = await loadGroups(token);
  const released = selectLorcanaGroups(groups, { now });
  const singlesByGroupId = new Map<number, boolean>();
  for (const group of released) {
    const products = await loadProducts(group.groupId);
    singlesByGroupId.set(group.groupId, products.some(productIsSingle));
  }

  const sets = sortLorcanaSets(
    selectLorcanaGroups(groups, { now, singlesByGroupId }).map(groupToSet),
  );
  setsCache = { token, sets };
  return sets;
}

export async function fetchCards(
  setId: string,
): Promise<{ cards: PokemonCard[]; meta: LorcanaFetchMeta }> {
  const groupId = Number(setId);
  if (!Number.isInteger(groupId) || groupId <= 0) {
    throw new LorcanaApiError(`Unknown Lorcana set "${setId}".`, 404);
  }

  const now = new Date();
  const token = cacheToken(await fetchTcgcsvLastUpdated(), now);
  const groups = await loadGroups(token);
  const group = groups.find((item) => item.groupId === groupId);
  if (!group || !isMainNumberedGroup(group) || !isReleasedGroup(group, now)) {
    throw new LorcanaApiError(`Unknown Lorcana set "${setId}".`, 404);
  }

  const products = await loadProducts(groupId);
  const prices = await loadPrices(groupId);
  const cards = buildLorcanaCards({ group, products, prices });
  return {
    cards,
    meta: { priceBackend: FAN_PRICE_BACKEND },
  };
}

/** Test helper — drop the in-process group/set cache. */
export function resetLorcanaCacheForTests(): void {
  groupsCache = null;
  setsCache = null;
  nextRequestAt = 0;
}
