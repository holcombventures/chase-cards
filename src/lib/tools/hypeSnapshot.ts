import { parseReleaseMs } from "./hypeScore";

export type SnapshotJob = { category: string; setId: string };

export type SnapshotIndex = {
  v: 1;
  builtAt: number;
  jobs: SnapshotJob[];
};

/** Recent paper sets only. The full Scryfall catalog is too large for a daily pass. */
export const MTG_SNAPSHOT_MAX = 36;
export const MTG_SNAPSHOT_AGE_DAYS = 540;
export const SNAPSHOT_INDEX_TTL_MS = 12 * 60 * 60 * 1000;
export const SNAPSHOT_FRESH_MS = 20 * 60 * 60 * 1000;

export function jobsForSets(
  category: string,
  sets: readonly { id: string; releaseDate?: string | null }[],
  now = Date.now(),
): SnapshotJob[] {
  if (category !== "mtg") {
    return sets.filter((set) => set.id).map((set) => ({ category, setId: set.id }));
  }
  const cutoff = now - MTG_SNAPSHOT_AGE_DAYS * 86_400_000;
  return sets
    .filter((set) => {
      const released = parseReleaseMs(set.releaseDate);
      return Boolean(set.id) && released !== null && released >= cutoff;
    })
    .sort((a, b) => (parseReleaseMs(b.releaseDate) ?? 0) - (parseReleaseMs(a.releaseDate) ?? 0))
    .slice(0, MTG_SNAPSHOT_MAX)
    .map((set) => ({ category, setId: set.id }));
}

export function indexIsFresh(index: SnapshotIndex | null, now = Date.now()): boolean {
  if (!index || index.v !== 1 || !Array.isArray(index.jobs) || !index.jobs.length) return false;
  return now - index.builtAt <= SNAPSHOT_INDEX_TTL_MS;
}

export function wrapCursor(length: number, index: number): number {
  if (length <= 0) return 0;
  const normalized = Number.isFinite(index) ? index : 0;
  return ((normalized % length) + length) % length;
}
