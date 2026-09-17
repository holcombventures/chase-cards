/**
 * Pokémon catalog adapter — wraps existing Pokémon TCG API + TCGdex paths.
 * Card/set enrichment (prices, MoM) stays in the API route for this category.
 */

import {
  fetchAllSets,
  fetchCardsBySet,
  PokemonTcgApiError,
} from "@/lib/api";
import type { PokemonCard, PokemonSet } from "@/lib/types";

export const categoryId = "pokemon" as const;

export { PokemonTcgApiError as CatalogApiError };

export async function fetchSets(): Promise<PokemonSet[]> {
  return fetchAllSets();
}

export async function fetchCards(setId: string): Promise<PokemonCard[]> {
  return fetchCardsBySet(setId);
}
