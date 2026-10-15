/**
 * Tool pages read sets and cards through the existing API handlers so price
 * snapshots, TCGCSV's once-a-day cadence, and adapter fallbacks stay in one place.
 */

import { GET as getSets } from "@/app/api/sets/route";
import { GET as getCards } from "@/app/api/sets/[setId]/cards/route";
import type { CardsApiMeta } from "@/lib/cardCacheModel";
import type { CardWithPrice, PokemonSet } from "@/lib/types";

type CardsPayload = {
  cards: CardWithPrice[];
  meta: CardsApiMeta;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function loadToolSets(category: string): Promise<PokemonSet[]> {
  const res = await getSets(
    new Request(`http://chasecards.local/api/sets?category=${encodeURIComponent(category)}`),
  );
  const body = asRecord(await res.json());
  if (!res.ok || !Array.isArray(body.data)) {
    const error = typeof body.error === "string" ? body.error : "Could not load sets.";
    throw new Error(error);
  }
  return body.data as PokemonSet[];
}

export async function loadToolCards(
  category: string,
  setId: string,
  options?: { setName?: string | null; releaseDate?: string | null },
): Promise<CardsPayload> {
  const params = new URLSearchParams({ category });
  if (options?.setName) params.set("setName", options.setName);
  if (options?.releaseDate) params.set("releaseDate", options.releaseDate);
  const res = await getCards(
    new Request(
      `http://chasecards.local/api/sets/${encodeURIComponent(setId)}/cards?${params}`,
    ),
    { params: Promise.resolve({ setId }) },
  );
  const body = asRecord(await res.json());
  if (!res.ok || !Array.isArray(body.data)) {
    const error = typeof body.error === "string" ? body.error : "Could not load cards.";
    throw new Error(error);
  }
  const meta = asRecord(body.meta) as CardsApiMeta;
  return { cards: body.data as CardWithPrice[], meta };
}
