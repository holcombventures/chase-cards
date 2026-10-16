/**
 * Sealed products for the box EV tool, one offer per TCGCSV SKU.
 * Cached for a day so a page view does not refetch the category.
 * Pokémon and One Piece singles do not come from TCGCSV, so this is their
 * only sealed-product path. The other games use it too, so the selector
 * can list every product instead of the single cheapest box.
 */

import { TcgcsvApiError, TCGCSV_BASE, fetchTcgcsvJson } from "@/lib/catalog/tcgcsv";
import {
  matchTcgcsvGroup,
  type SealedGroup,
  type SealedPriceRow,
  type SealedProduct,
} from "@/lib/catalog/sealedBox";
import type { ToolCategoryId } from "./categories";
import { buildSealedOffers, type SealedOffer } from "./sealedProducts";
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

type StoredList = {
  at: number;
  offers: SealedOffer[];
};

const memoryQuotes = new Map<string, StoredList>();
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

function freshStored(value: unknown, now: number): StoredList | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<StoredList>;
  if (typeof row.at !== "number" || now - row.at > QUOTE_TTL_MS) return null;
  if (!Array.isArray(row.offers)) return null;
  return { at: row.at, offers: row.offers };
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

async function offersForGroup(
  category: ToolCategoryId,
  categoryId: number,
  groupId: number,
  set: { id: string; name?: string | null },
): Promise<SealedOffer[]> {
  const productsPayload = await fetchTcgcsvJson(
    `${TCGCSV_BASE}/tcgplayer/${categoryId}/${groupId}/products`,
    USER_AGENT,
  );
  const pricesPayload = await fetchTcgcsvJson(
    `${TCGCSV_BASE}/tcgplayer/${categoryId}/${groupId}/prices`,
    USER_AGENT,
  );
  return buildSealedOffers(
    resultsOf(productsPayload) as SealedProduct[],
    resultsOf(pricesPayload) as SealedPriceRow[],
    { category, id: set.id, name: set.name },
  );
}

export async function lookupSealedProducts(input: {
  category: ToolCategoryId;
  setId: string;
  setName?: string | null;
}): Promise<SealedOffer[]> {
  const setId = input.setId.trim();
  const key = `sealed-products/v3/${input.category}/${setId}`;
  const now = Date.now();
  const remembered = freshStored(memoryQuotes.get(key), now) ?? freshStored(await readToolJson(key), now);
  if (remembered) {
    memoryQuotes.set(key, remembered);
    return remembered.offers;
  }

  const categoryId = TCGCSV_CATEGORY[input.category];
  let groupId: number | null = null;
  if (/^\d+$/.test(setId)) {
    groupId = Number(setId);
  } else {
    const groups = await loadGroups(categoryId);
    groupId = matchTcgcsvGroup(groups, { id: setId, name: input.setName })?.groupId ?? null;
  }
  const offers =
    groupId === null ? [] : await offersForGroup(input.category, categoryId, groupId, { id: setId, name: input.setName });
  const stored: StoredList = { at: now, offers };
  memoryQuotes.set(key, stored);
  try {
    await writeToolJson(key, stored);
  } catch (err) {
    console.error("sealed product cache write failed:", err);
  }
  return offers;
}
