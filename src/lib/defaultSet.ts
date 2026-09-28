import type { CategoryId } from "./catalog/types";
import type { PokemonSet } from "./types";

/**
 * Temporary pin until about 2026-10-10, when the owner will decide whether
 * to revert to newest-with-prices.
 */
export const DEFAULT_SET_BY_CATEGORY: Partial<Record<CategoryId, string>> = {
  pokemon: "me5",
};

function isReleasedBeforeCutoff(releaseDate: string, cutoffMs: number): boolean {
  const raw = (releaseDate || "").replace(/\//g, "-");
  const t = Date.parse(raw);
  return Number.isFinite(t) && t <= cutoffMs;
}

/**
 * Set to show when nothing is selected yet.
 * A pinned id is used only when that set is in the loaded list. Otherwise
 * the previous rule applies: the first set released at least 3 days ago,
 * or the first set in list order when none are that old.
 */
export function pickDefaultSetId(
  sets: PokemonSet[],
  categoryId?: CategoryId,
): string {
  if (!sets.length) return "";

  const pinned = categoryId ? DEFAULT_SET_BY_CATEGORY[categoryId] : undefined;
  if (pinned && sets.some((set) => set.id === pinned)) return pinned;

  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const stable = sets.find((set) =>
    isReleasedBeforeCutoff(set.releaseDate, cutoff),
  );
  return (stable ?? sets[0]).id;
}

/** Keep a set the visitor already chose; otherwise apply the category default. */
export function resolveSetSelection(
  currentSetId: string,
  sets: PokemonSet[],
  categoryId?: CategoryId,
): string {
  return currentSetId || pickDefaultSetId(sets, categoryId);
}
