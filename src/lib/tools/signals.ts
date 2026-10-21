/**
 * Keyless hype signals. Limitless tournament standings and public subreddit
 * RSS. Failures become "unavailable" — they never throw to the page.
 * Results are cached so a refresh does not hammer either host.
 */

import type { HypeCategoryId } from "./categories";
import {
  collectDeckCards,
  parseAtomEntries,
  REDDIT_BUSY_DETAIL,
  RIFTBOUND_NO_DECKS,
  tallyDeckPresence,
  type BuzzSignal,
  type TournamentSignal,
} from "./hypeScore";
import { readToolJson, writeToolJson } from "./toolStore";

const USER_AGENT = "ChaseCards/1.0 (collector tools; +https://chasecards.online)";
const FETCH_TIMEOUT_MS = 4500;
const TOURNAMENT_OK_TTL_MS = 6 * 60 * 60 * 1000;
export const BUZZ_OK_TTL_MS = 12 * 60 * 60 * 1000;
export const BUSY_TTL_MS = 15 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;

const LIMITLESS_GAME: Partial<Record<HypeCategoryId, string>> = {
  pokemon: "PTCG",
  "one-piece": "OP",
  lorcana: "LORCANA",
  riftbound: "RB",
  gundam: "GUNDAM",
};

const LIMITLESS_FORMAT: Partial<Record<HypeCategoryId, string>> = {
  pokemon: "STANDARD",
  lorcana: "CONSTRUCTED",
};

/** Confirmed public feeds, plus r/magicTCG for the hype tracker. */
const SUBREDDIT: Partial<Record<HypeCategoryId, string>> = {
  pokemon: "PokemonTCG",
  "one-piece": "OnePieceTCG",
  lorcana: "Lorcana",
  riftbound: "riftboundtcg",
  gundam: "gundamcardgame",
  mtg: "magicTCG",
};

function emptyCounts(): { copies: Record<string, number>; decks: Record<string, number> } {
  return { copies: {}, decks: {} };
}

export function signalCacheTtl(kind: "tournament" | "buzz", status: string): number {
  if (status === "busy") return BUSY_TTL_MS;
  if (status === "ok" && kind === "buzz") return BUZZ_OK_TTL_MS;
  if (status === "ok") return TOURNAMENT_OK_TTL_MS;
  return FAIL_TTL_MS;
}

export type HypeSignals = {
  tournament: TournamentSignal;
  buzz: BuzzSignal;
  cached: boolean;
};

type CachedSignal<T> = { storedAt: number; value: T };

const memoryCache = new Map<string, { storedAt: number; value: TournamentSignal | BuzzSignal }>();

function cacheShapeOk(kind: "tournament" | "buzz", value: { status: string }): boolean {
  if (kind !== "tournament") return true;
  const decks = (value as TournamentSignal).decks;
  return Boolean(decks) && typeof decks === "object";
}

function cacheKey(category: string, kind: "tournament" | "buzz"): string {
  return `signals/${category}/${kind}`;
}

async function fetchText(url: string, accept: string): Promise<{ ok: boolean; status: number; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: accept,
        "User-Agent": USER_AGENT,
      },
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function loadTournament(category: HypeCategoryId): Promise<TournamentSignal> {
  const gameId = LIMITLESS_GAME[category];
  if (!gameId) {
    return {
      status: "skipped",
      detail:
        category === "mtg"
          ? "No public decklists for Magic in this tracker."
          : "No public decklists for this game.",
      gameId: null,
      decklists: 0,
      ...emptyCounts(),
    };
  }
  const params = new URLSearchParams({ game: gameId, limit: "12" });
  const format = LIMITLESS_FORMAT[category];
  if (format) params.set("format", format);
  let list: { ok: boolean; status: number; text: string };
  try {
    list = await fetchText(
      `https://play.limitlesstcg.com/api/tournaments?${params}`,
      "application/json",
    );
  } catch {
    return {
      status: "unavailable",
      detail: "Tournament results didn't load, so this score uses the other signals.",
      gameId,
      decklists: 0,
      ...emptyCounts(),
    };
  }
  if (!list.ok) {
    return {
      status: "unavailable",
      detail: "Tournament results didn't load, so this score uses the other signals.",
      gameId,
      decklists: 0,
      ...emptyCounts(),
    };
  }
  let rows: { id?: string; players?: number }[] = [];
  try {
    const parsed = JSON.parse(list.text) as unknown;
    if (Array.isArray(parsed)) rows = parsed as { id?: string; players?: number }[];
  } catch {
    return {
      status: "unavailable",
      detail: "Tournament results didn't load, so this score uses the other signals.",
      gameId,
      decklists: 0,
      ...emptyCounts(),
    };
  }
  const ids = rows
    .filter((row) => typeof row.id === "string" && row.id)
    .sort((a, b) => (b.players || 0) - (a.players || 0))
    .slice(0, 6)
    .map((row) => row.id as string);
  if (!ids.length) {
    return {
      status: category === "riftbound" ? "skipped" : "unavailable",
      detail:
        category === "riftbound"
          ? RIFTBOUND_NO_DECKS
          : "No recent events were listed, so this score uses the other signals.",
      gameId,
      decklists: 0,
      ...emptyCounts(),
    };
  }

  const standings = await Promise.all(
    ids.map(async (id) => {
      try {
        const res = await fetchText(
          `https://play.limitlesstcg.com/api/tournaments/${encodeURIComponent(id)}/standings`,
          "application/json",
        );
        if (!res.ok) return [];
        const parsed = JSON.parse(res.text) as unknown;
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }),
  );

  const decks: ReturnType<typeof collectDeckCards>[] = [];
  let responded = 0;
  for (const rows of standings) {
    if (rows.length) responded += 1;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const decklist = (row as { decklist?: unknown }).decklist;
      if (!decklist) continue;
      const found = collectDeckCards(decklist);
      if (!found.length) continue;
      decks.push(found);
    }
  }
  if (!decks.length) {
    return {
      status: category === "riftbound" ? "skipped" : "unavailable",
      detail:
        category === "riftbound"
          ? RIFTBOUND_NO_DECKS
          : responded
            ? "Those events didn't publish decklists, so this score uses the other signals."
            : "Tournament results didn't load, so this score uses the other signals.",
      gameId,
      decklists: 0,
      ...emptyCounts(),
    };
  }
  const presence = tallyDeckPresence(decks);
  return {
    status: "ok",
    detail: `Last 6 big events · ${decks.length} public decklist${decks.length === 1 ? "" : "s"}.`,
    gameId,
    decklists: decks.length,
    copies: presence.copies,
    decks: presence.decks,
  };
}

async function loadBuzz(category: HypeCategoryId): Promise<BuzzSignal> {
  const subreddit = SUBREDDIT[category];
  if (!subreddit) {
    return {
      status: "skipped",
      detail: "No public subreddit feed for this game.",
      subreddit: null,
      posts: [],
    };
  }
  let res: { ok: boolean; status: number; text: string };
  try {
    res = await fetchText(
      `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/.rss`,
      "application/atom+xml, application/rss+xml, text/xml",
    );
  } catch {
    return {
      status: "unavailable",
      detail: `r/${subreddit} did not respond.`,
      subreddit,
      posts: [],
    };
  }
  if (res.status === 429) {
    return {
      status: "busy",
      detail: REDDIT_BUSY_DETAIL,
      subreddit,
      posts: [],
    };
  }
  if (!res.ok) {
    return {
      status: "unavailable",
      detail: `r/${subreddit} returned ${res.status}.`,
      subreddit,
      posts: [],
    };
  }
  const posts = parseAtomEntries(res.text)
    .slice(0, 25)
    .map((post) => ({
      title: post.title.slice(0, 180),
      text: post.text.slice(0, 500),
    }));
  if (!posts.length) {
    return {
      status: "unavailable",
      detail: `r/${subreddit} returned no posts.`,
      subreddit,
      posts: [],
    };
  }
  return {
    status: "ok",
    detail: `${posts.length} recent posts from r/${subreddit}.`,
    subreddit,
    posts,
  };
}

function readCached<T extends { status: string }>(
  raw: unknown,
  now: number,
  kind: "tournament" | "buzz",
): T | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { storedAt?: unknown; value?: T };
  if (typeof value.storedAt !== "number" || !value.value || typeof value.value.status !== "string") {
    return null;
  }
  if (now - value.storedAt > signalCacheTtl(kind, value.value.status)) return null;
  return value.value;
}

async function loadCached<T extends { status: string }>(
  category: HypeCategoryId,
  kind: "tournament" | "buzz",
  now: number,
  load: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const key = cacheKey(category, kind);
  const memorized = memoryCache.get(key) as { storedAt: number; value: T } | undefined;
  if (
    memorized &&
    now - memorized.storedAt <= signalCacheTtl(kind, memorized.value.status) &&
    cacheShapeOk(kind, memorized.value)
  ) {
    return { value: memorized.value, cached: true };
  }
  if (!memorized) {
    try {
      const stored = readCached<T>(await readToolJson(key), now, kind);
      if (stored && cacheShapeOk(kind, stored)) {
        memoryCache.set(key, {
          storedAt: now,
          value: stored as unknown as TournamentSignal | BuzzSignal,
        });
        return { value: stored, cached: true };
      }
    } catch (err) {
      console.error("hype signal cache read failed:", err);
    }
  }
  const value = await load();
  const fresh: CachedSignal<T> = { storedAt: now, value };
  memoryCache.set(key, fresh as unknown as { storedAt: number; value: TournamentSignal | BuzzSignal });
  if (value.status === "ok" || value.status === "busy") {
    try {
      await writeToolJson(key, fresh);
    } catch (err) {
      console.error("hype signal cache write failed:", err);
    }
  }
  return { value, cached: false };
}

export async function loadHypeSignals(category: HypeCategoryId, now = Date.now()): Promise<HypeSignals> {
  const tournament = await loadCached(category, "tournament", now, () => loadTournament(category));
  const buzz = await loadCached(category, "buzz", now, () => loadBuzz(category));
  return {
    tournament: tournament.value,
    buzz: buzz.value,
    cached: tournament.cached && buzz.cached,
  };
}
