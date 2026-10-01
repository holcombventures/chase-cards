/**
 * Shared TCGCSV client. TCGCSV (https://tcgcsv.com) is a keyless daily mirror
 * of TCGplayer. Each game passes its category id, main-set filter, and
 * collector-number parser. Fetches stay server-side, send a custom User-Agent,
 * and leave a gap between requests. Callers keep a 24h price snapshot.
 * There is no price-history archive, so month-over-month is N/A.
 */

import type { PokemonCard, PokemonSet } from "@/lib/types";

export const TCGCSV_BASE = "https://tcgcsv.com";

/** Minimum gap between TCGCSV request starts, shared by every category. */
const REQUEST_GAP_MS = 200;

const FAN_PRICE_BACKEND = "tcgcsv" as const;

/**
 * A set is listed only when at least this many singles have a market price.
 * Preview lists (Riftbound Radiance's unpriced singles, Gundam Stardust
 * Trails' sealed-only products) stay hidden until real prices exist.
 */
export const PRICED_SINGLES_FLOOR = 1;

export type TcgcsvPriceBackend = typeof FAN_PRICE_BACKEND;

export type TcgcsvFetchMeta = {
  priceBackend: TcgcsvPriceBackend;
};

export class TcgcsvApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "TcgcsvApiError";
    this.status = status;
  }
}

export class LorcanaApiError extends TcgcsvApiError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = "LorcanaApiError";
  }
}

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

export type ParsedCollectorNumber = {
  /** Value stored on the card and shown in the UI. */
  number: string;
  printedTotal: number;
};

export type TcgcsvAdapterConfig = {
  categoryId: string;
  tcgcsvCategoryId: number;
  userAgent: string;
  /** Game name used in error strings, e.g. "Lorcana". */
  errorLabel: string;
  createError?: (message: string, status: number) => TcgcsvApiError;
  isMainGroup: (group: TcgcsvGroup) => boolean;
  parseCollectorNumber: (raw: string) => ParsedCollectorNumber | null;
  seriesForGroup: (group: TcgcsvGroup) => string;
  /**
   * Hide groups whose publishedOn is still in the future.
   * Lorcana keeps this on. Riftbound and Gundam use priced singles instead,
   * so a preview can appear as soon as it has prices.
   */
  requireReleased?: boolean;
  /** Hide groups that do not have enough priced singles. */
  requirePricedSingles?: boolean;
  minPricedSingles?: number;
  /** Collapse a separate "(Foil)" SKU onto the card that shares its number. */
  mergeFoilSkus?: boolean;
  /** Parallels that share a collector number stay separate. */
  distinguishByRarity?: boolean;
  /** Append a parallel rarity such as LR++ when the title does not already say it. */
  labelParallelRarity?: boolean;
};

type GroupsCache = {
  token: string;
  groups: TcgcsvGroup[];
};

type SetsCache = {
  token: string;
  sets: PokemonSet[];
};

let nextRequestAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Space out upstream calls even when a few categories are in flight. */
async function paceRequest(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextRequestAt);
  nextRequestAt = startAt + REQUEST_GAP_MS;
  const wait = startAt - now;
  if (wait > 0) await sleep(wait);
}

export function resetTcgcsvRequestPaceForTests(): void {
  nextRequestAt = 0;
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

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** publishedOn is a date (no reliable offset). Future dates stay hidden. */
export function isReleasedGroup(group: TcgcsvGroup, now: Date = new Date()): boolean {
  const day = (group.publishedOn || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  return day <= utcDay(now);
}

export function extendedValue(product: TcgcsvProduct, field: string): string | null {
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

function parallelLabel(name: string, rarity: string | null, enabled: boolean): string {
  if (!enabled) return name;
  const label = (rarity || "").trim();
  if (!label.includes("+")) return name;
  const token = `(${label})`;
  if (name.toLowerCase().includes(token.toLowerCase())) return name;
  return `${name} ${token}`;
}

export function selectTcgcsvGroups(
  groups: readonly TcgcsvGroup[],
  options: {
    now?: Date;
    isMainGroup: (group: TcgcsvGroup) => boolean;
    requireReleased?: boolean;
    /**
     * When provided, a group is kept only when this map says it is listable
     * (has singles, or has enough priced singles).
     */
    availabilityByGroupId?: ReadonlyMap<number, boolean>;
  },
): TcgcsvGroup[] {
  const now = options.now ?? new Date();
  const requireReleased = options.requireReleased !== false;
  const availability = options.availabilityByGroupId;
  return groups.filter((group) => {
    if (!group || !Number.isFinite(group.groupId)) return false;
    if (!(group.name || "").trim()) return false;
    if (!options.isMainGroup(group)) return false;
    if (requireReleased && !isReleasedGroup(group, now)) return false;
    if (availability && availability.get(group.groupId) !== true) return false;
    return true;
  });
}

export function countPricedSingles(
  products: readonly TcgcsvProduct[],
  prices: readonly TcgcsvPriceRow[],
  parseCollectorNumber: (raw: string) => ParsedCollectorNumber | null,
): number {
  const priced = new Set<number>();
  for (const row of prices) {
    if (!Number.isFinite(row.productId)) continue;
    if (asFinitePrice(row.marketPrice) === null) continue;
    priced.add(row.productId);
  }
  let count = 0;
  for (const product of products) {
    if (!product || !Number.isFinite(product.productId)) continue;
    if (!priced.has(product.productId)) continue;
    if (!productIsSingle(product)) continue;
    const raw = extendedValue(product, "Number");
    if (!raw || !parseCollectorNumber(raw)) continue;
    count += 1;
  }
  return count;
}

type NumberRank = {
  band: number;
  prefix: string;
  num: number;
  suffix: string;
};

/**
 * All-digit numbers compare by parseInt so Lorcana order stays "2" then "10".
 * Coded numbers (GD05-067, EXR-009) and tokens (021a, 189*, SP1) sort by
 * their own prefix and integer, not by parseInt of the whole string.
 */
export function rankCollectorNumber(
  number: string,
  primaryCode?: string,
): NumberRank {
  if (/^\d+$/.test(number)) {
    return { band: 0, prefix: "", num: parseInt(number, 10), suffix: "" };
  }
  const coded = number.match(/^([A-Za-z]+\d*)-(\d+)$/);
  if (coded) {
    const prefix = coded[1].toUpperCase();
    const code = (primaryCode || "").trim();
    const own = /^[A-Za-z]+\d+$/.test(code) && prefix === code.toUpperCase();
    return {
      band: own ? 0 : 1,
      prefix,
      num: parseInt(coded[2], 10),
      suffix: "",
    };
  }
  const token = number.match(/^([A-Za-z]*)(\d+)(.*)$/);
  if (token) {
    return {
      band: 0,
      prefix: (token[1] || "").toUpperCase(),
      num: parseInt(token[2], 10),
      suffix: token[3] || "",
    };
  }
  return {
    band: 2,
    prefix: number.toUpperCase(),
    num: Number.MAX_SAFE_INTEGER,
    suffix: "",
  };
}

export function compareCollectorNumbers(
  a: string,
  b: string,
  primaryCode?: string,
): number {
  const left = rankCollectorNumber(a, primaryCode);
  const right = rankCollectorNumber(b, primaryCode);
  if (left.band !== right.band) return left.band - right.band;
  if (left.prefix !== right.prefix) return left.prefix.localeCompare(right.prefix);
  if (left.num !== right.num) return left.num - right.num;
  if (left.suffix !== right.suffix) return left.suffix.localeCompare(right.suffix);
  return 0;
}

export function groupToSet(group: TcgcsvGroup, series: string): PokemonSet {
  const release = (group.publishedOn || "").trim().slice(0, 10);
  return {
    id: String(group.groupId),
    name: (group.name || "").trim(),
    series,
    printedTotal: 0,
    total: 0,
    releaseDate: /^\d{4}-\d{2}-\d{2}$/.test(release) ? release : "",
  };
}

export function sortTcgcsvSets(sets: readonly PokemonSet[]): PokemonSet[] {
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

/**
 * Join products to prices. When mergeFoilSkus is on, "(Foil)" SKUs that share
 * a collector number and title collapse into one card and the higher
 * marketPrice wins. Parallels stay separate when distinguishByRarity is on.
 */
export function buildTcgcsvCards(
  input: {
    group: TcgcsvGroup;
    products: readonly TcgcsvProduct[];
    prices: readonly TcgcsvPriceRow[];
  },
  config: Pick<
    TcgcsvAdapterConfig,
    | "categoryId"
    | "parseCollectorNumber"
    | "mergeFoilSkus"
    | "distinguishByRarity"
    | "labelParallelRarity"
  >,
): PokemonCard[] {
  const mergeFoilSkus = config.mergeFoilSkus !== false;
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
    const parsed = config.parseCollectorNumber(rawNumber);
    if (!parsed) continue;
    const rawName = (product.name || "").trim();
    if (!rawName) continue;
    const rarity = extendedValue(product, "Rarity");
    const stripped = displayCardName(rawName);
    const displayName = parallelLabel(stripped, rarity, config.labelParallelRarity === true);
    if (!displayName) continue;
    drafts.push({
      product,
      number: parsed.number,
      printedTotal: parsed.printedTotal,
      numberKey: `${parsed.number}/${parsed.printedTotal}`,
      displayName,
      rarity,
      foilSku: isFoilSkuName(rawName),
      best: bestMarket(pricesByProduct.get(product.productId) || []),
    });
  }

  const grouped = new Map<string, SingleDraft[]>();
  for (const draft of drafts) {
    const rarityKey = config.distinguishByRarity
      ? (draft.rarity || "").toLowerCase()
      : "";
    const key = mergeFoilSkus
      ? `${draft.numberKey}::${draft.displayName.toLowerCase()}::${rarityKey}`
      : `${draft.product.productId}`;
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
    const images = tcgplayerImageUrls(winner.product.productId, winner.product.imageUrl);
    const card: PokemonCard = {
      id: `${config.categoryId}-${setId}-${base.product.productId}`,
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
  const primaryCode = (input.group.abbreviation || "").trim();
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
      const byNumber = compareCollectorNumbers(a.number, b.number, primaryCode);
      if (byNumber !== 0) return byNumber;
      return a.name.localeCompare(b.name);
    });
}

function normalizeGroup(raw: unknown): TcgcsvGroup | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Partial<TcgcsvGroup>;
  const groupId = typeof row.groupId === "number" ? row.groupId : Number(row.groupId);
  const name = typeof row.name === "string" ? row.name.trim() : "";
  const abbreviation = typeof row.abbreviation === "string" ? row.abbreviation.trim() : "";
  if (!Number.isFinite(groupId) || !name) return null;
  return {
    groupId,
    name,
    abbreviation,
    publishedOn: typeof row.publishedOn === "string" ? row.publishedOn : null,
    modifiedOn: typeof row.modifiedOn === "string" ? row.modifiedOn : null,
  };
}

function cacheToken(lastUpdated: string | null, now: Date): string {
  if (lastUpdated) return lastUpdated;
  // Hour bucket when the daily stamp is unreachable, so a bad probe
  // does not refetch the whole category on every request.
  return `unchecked:${now.toISOString().slice(0, 13)}`;
}

export function createTcgcsvAdapter(config: TcgcsvAdapterConfig) {
  const label = config.errorLabel;
  const createError =
    config.createError ?? ((message: string, status: number) => new TcgcsvApiError(message, status));
  const requireReleased = config.requireReleased !== false;
  const requirePricedSingles = config.requirePricedSingles === true;
  const minPricedSingles = config.minPricedSingles ?? PRICED_SINGLES_FLOOR;

  let groupsCache: GroupsCache | null = null;
  let setsCache: SetsCache | null = null;

  function fail(message: string, status: number): never {
    throw createError(message, status);
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
            "User-Agent": config.userAgent,
          },
          cache: "no-store",
        });
      } catch {
        if (attempt < retries) {
          await sleep(400 * attempt);
          continue;
        }
        fail(`${label} card API error (network).`, 502);
      }

      lastStatus = res.status;
      const body = await res.text();

      if (res.status === 429) {
        if (attempt < retries) {
          await sleep(500 * attempt);
          continue;
        }
        fail(`Rate limited by the ${label} card API. Try again shortly.`, 429);
      }

      if (res.ok) return { status: res.status, body };

      if ((res.status >= 500 || res.status === 408) && attempt < retries) {
        await sleep(400 * attempt);
        continue;
      }

      return { status: res.status, body };
    }

    fail(`${label} card API error (${lastStatus || "network"}).`, lastStatus || 502);
  }

  async function fetchJson<T>(url: string): Promise<T> {
    const { status, body } = await fetchUpstream(url);
    if (status < 200 || status >= 300) {
      fail(`${label} card API error (${status}).`, status === 404 ? 404 : 502);
    }
    try {
      return JSON.parse(body) as T;
    } catch {
      fail(`${label} card API returned invalid JSON.`, 502);
    }
  }

  async function fetchLastUpdated(): Promise<string | null> {
    try {
      const { status, body } = await fetchUpstream(`${TCGCSV_BASE}/last-updated.txt`);
      if (status < 200 || status >= 300) return null;
      const token = body.trim();
      return token || null;
    } catch {
      return null;
    }
  }

  async function loadGroups(token: string): Promise<TcgcsvGroup[]> {
    if (groupsCache && groupsCache.token === token) return groupsCache.groups;
    const payload = await fetchJson<unknown>(
      `${TCGCSV_BASE}/tcgplayer/${config.tcgcsvCategoryId}/groups`,
    );
    const groups = unwrapResults<unknown>(payload)
      .map(normalizeGroup)
      .filter((group): group is TcgcsvGroup => Boolean(group));
    if (groups.length === 0) {
      fail(`TCGCSV returned no ${label} groups.`, 502);
    }
    groupsCache = { token, groups };
    return groups;
  }

  async function loadProducts(groupId: number): Promise<TcgcsvProduct[]> {
    const payload = await fetchJson<unknown>(
      `${TCGCSV_BASE}/tcgplayer/${config.tcgcsvCategoryId}/${groupId}/products`,
    );
    return unwrapResults<TcgcsvProduct>(payload);
  }

  async function loadPrices(groupId: number): Promise<TcgcsvPriceRow[]> {
    const payload = await fetchJson<unknown>(
      `${TCGCSV_BASE}/tcgplayer/${config.tcgcsvCategoryId}/${groupId}/prices`,
    );
    return unwrapResults<TcgcsvPriceRow>(payload);
  }

  function listable(group: TcgcsvGroup, now: Date, availability?: ReadonlyMap<number, boolean>) {
    return (
      selectTcgcsvGroups([group], {
        now,
        isMainGroup: config.isMainGroup,
        requireReleased,
        availabilityByGroupId: availability,
      }).length === 1
    );
  }

  async function fetchSets(now: Date = new Date()): Promise<PokemonSet[]> {
    const lastUpdated = await fetchLastUpdated();
    const token = cacheToken(lastUpdated, now);
    if (setsCache && setsCache.token === token) return setsCache.sets;

    const groups = await loadGroups(token);
    const candidates = selectTcgcsvGroups(groups, {
      now,
      isMainGroup: config.isMainGroup,
      requireReleased,
    });
    const availability = new Map<number, boolean>();
    for (const group of candidates) {
      const products = await loadProducts(group.groupId);
      if (!requirePricedSingles) {
        availability.set(group.groupId, products.some(productIsSingle));
        continue;
      }
      if (!products.some(productIsSingle)) {
        availability.set(group.groupId, false);
        continue;
      }
      const prices = await loadPrices(group.groupId);
      availability.set(
        group.groupId,
        countPricedSingles(products, prices, config.parseCollectorNumber) >= minPricedSingles,
      );
    }

    const sets = sortTcgcsvSets(
      selectTcgcsvGroups(groups, {
        now,
        isMainGroup: config.isMainGroup,
        requireReleased,
        availabilityByGroupId: availability,
      }).map((group) => groupToSet(group, config.seriesForGroup(group))),
    );
    setsCache = { token, sets };
    return sets;
  }

  async function fetchCards(
    setId: string,
  ): Promise<{ cards: PokemonCard[]; meta: TcgcsvFetchMeta }> {
    const groupId = Number(setId);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      fail(`Unknown ${label} set "${setId}".`, 404);
    }

    const now = new Date();
    const token = cacheToken(await fetchLastUpdated(), now);
    const groups = await loadGroups(token);
    const group = groups.find((item) => item.groupId === groupId);
    if (!group || !listable(group, now)) {
      fail(`Unknown ${label} set "${setId}".`, 404);
    }

    const products = await loadProducts(groupId);
    const prices = await loadPrices(groupId);
    if (requirePricedSingles) {
      const priced = countPricedSingles(products, prices, config.parseCollectorNumber);
      if (priced < minPricedSingles) {
        fail(`Unknown ${label} set "${setId}".`, 404);
      }
    }
    const cards = buildTcgcsvCards({ group, products, prices }, config);
    return {
      cards,
      meta: { priceBackend: FAN_PRICE_BACKEND },
    };
  }

  function resetCache(): void {
    groupsCache = null;
    setsCache = null;
    resetTcgcsvRequestPaceForTests();
  }

  return {
    categoryId: config.categoryId,
    fetchSets,
    fetchCards,
    resetCache,
    buildCards: (
      input: {
        group: TcgcsvGroup;
        products: readonly TcgcsvProduct[];
        prices: readonly TcgcsvPriceRow[];
      },
    ) => buildTcgcsvCards(input, config),
  };
}
