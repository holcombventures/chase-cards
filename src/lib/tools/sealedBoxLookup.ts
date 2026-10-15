/**
 * Sealed booster market for the box EV tool.
 * Lorcana, Riftbound, and Gundam already download this product feed while
 * loading singles, and that path stamps the quote on the cards response.
 * This lookup is the fallback, and the only path for Pokémon and One Piece,
 * whose singles do not come from TCGCSV. Results stay cached for a day so
 * a page view does not refetch the category.
 */

import { TcgcsvApiError, TCGCSV_BASE, fetchTcgcsvJson } from "@/lib/catalog/tcgcsv";
import {
  matchTcgcsvGroup,
  selectSealedBoosterBox,
  type SealedBoxQuote,
  type SealedGroup,
  type SealedPriceRow,
  type SealedProduct,
} from "@/lib/catalog/sealedBox";
import type { ToolCategoryId } from "./categories";
import { readToolJson, writeToolJson } from "./toolStore";

const USER_AGENT = "ChaseCards/1.0 (sealed box estimate; +https://chasecards.online)";
const QUOTE_TTL_MS = 24 * 60 * 60 * 1000;

const TCGCSV_CATEGORY: Record<ToolCategoryId, number> = {
  pokemon: 3,
  "one-piece": 68,
  lorcana: 71,
  riftbound: 89,
  gundam: 86,
};

type StoredQuote = {
  at: number;
  marketPrice: number | null;
  name: string | null;
};

const memoryQuotes = new Map<string, StoredQuote>();
const groupsCache = new Map<number, { at: number; groups: SealedGroup[] }>();

function resultsOf(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { results?: unknown }).results)) {
    return (payload as { results: unknown[] }).results;
  }
  return [];
}

function asGroups(payload: unknown): SealedGroup[] {
  const groups: SealedGroup[] = [];
  for (const raw of resultsOf(payload)) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as { groupId?: unknown; name?: unknown; abbreviation?: unknown };
    const groupId = typeof row.groupId === "number" ? row.groupId : Number(row.groupId);
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const abbreviation = typeof row.abbreviation === "string" ? row.abbreviation.trim() : "";
    if (!Number.isFinite(groupId) || !name) continue;
    groups.push({ groupId, name, abbreviation });
  }
  return groups;
}

function freshStored(value: unknown, now: number): StoredQuote | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<StoredQuote>;
  if (typeof row.at !== "number" || now - row.at > QUOTE_TTL_MS) return null;
  if (row.marketPrice !== null && typeof row.marketPrice !== "number") return null;
  if (row.name !== null && typeof row.name !== "string") return null;
  return {
    at: row.at,
    marketPrice: row.marketPrice ?? null,
    name: row.name ?? null,
  };
}

function quoteFromStored(row: StoredQuote): SealedBoxQuote | null {
  if (typeof row.marketPrice !== "number" || !row.name) return null;
  return { marketPrice: row.marketPrice, name: row.name, productId: 0 };
}

async function loadGroups(categoryId: number): Promise<SealedGroup[]> {
  const now = Date.now();
  const cached = groupsCache.get(categoryId);
  if (cached && now - cached.at <= QUOTE_TTL_MS) return cached.groups;
  const payload = await fetchTcgcsvJson(`${TCGCSV_BASE}/tcgplayer/${categoryId}/groups`, USER_AGENT);
  const groups = asGroups(payload);
  if (!groups.length) throw new TcgcsvApiError("TCGCSV returned no groups.", 502);
  groupsCache.set(categoryId, { at: now, groups });
  return groups;
}

async function quoteForGroup(categoryId: number, groupId: number): Promise<SealedBoxQuote | null> {
  const productsPayload = await fetchTcgcsvJson(
    `${TCGCSV_BASE}/tcgplayer/${categoryId}/${groupId}/products`,
    USER_AGENT,
  );
  const pricesPayload = await fetchTcgcsvJson(
    `${TCGCSV_BASE}/tcgplayer/${categoryId}/${groupId}/prices`,
    USER_AGENT,
  );
  return selectSealedBoosterBox(
    resultsOf(productsPayload) as SealedProduct[],
    resultsOf(pricesPayload) as SealedPriceRow[],
  );
}

export async function lookupSealedBoxMarket(input: {
  category: ToolCategoryId;
  setId: string;
  setName?: string | null;
}): Promise<SealedBoxQuote | null> {
  const setId = input.setId.trim();
  const key = `sealed-box/${input.category}/${setId}`;
  const now = Date.now();
  const remembered = freshStored(memoryQuotes.get(key), now) ?? freshStored(await readToolJson(key), now);
  if (remembered) {
    memoryQuotes.set(key, remembered);
    return quoteFromStored(remembered);
  }

  const categoryId = TCGCSV_CATEGORY[input.category];
  let groupId: number | null = null;
  if (/^\d+$/.test(setId)) {
    groupId = Number(setId);
  } else {
    const groups = await loadGroups(categoryId);
    groupId = matchTcgcsvGroup(groups, { id: setId, name: input.setName })?.groupId ?? null;
  }
  const quote = groupId === null ? null : await quoteForGroup(categoryId, groupId);
  const stored: StoredQuote = {
    at: now,
    marketPrice: quote?.marketPrice ?? null,
    name: quote?.name ?? null,
  };
  memoryQuotes.set(key, stored);
  try {
    await writeToolJson(key, stored);
  } catch (err) {
    console.error("sealed box cache write failed:", err);
  }
  return quote;
}
