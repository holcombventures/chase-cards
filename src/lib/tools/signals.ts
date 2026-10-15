/**
 * Keyless hype signals. Limitless tournament standings and public subreddit
 * RSS. Failures become "unavailable" — they never throw to the page.
 * Results are cached so a refresh does not hammer either host.
 */

import type { ToolCategoryId } from "./categories";
import {
  collectDeckCards,
  parseAtomEntries,
  tallyCopies,
  type BuzzSignal,
  type TournamentSignal,
} from "./hypeScore";
import { readToolJson, writeToolJson } from "./toolStore";

const USER_AGENT = "ChaseCards/1.0 (collector tools; +https://chasecards.online)";
const FETCH_TIMEOUT_MS = 4500;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const FAIL_TTL_MS = 60 * 1000;

const LIMITLESS_GAME: Record<ToolCategoryId, string> = {
  pokemon: "PTCG",
  "one-piece": "OP",
  lorcana: "LORCANA",
  riftbound: "RB",
  gundam: "GUNDAM",
};

const LIMITLESS_FORMAT: Partial<Record<ToolCategoryId, string>> = {
  pokemon: "STANDARD",
  lorcana: "CONSTRUCTED",
};

/** Confirmed public feeds: r/PokemonTCG, r/OnePieceTCG, r/Lorcana, r/riftboundtcg, r/gundamcardgame. */
const SUBREDDIT: Record<ToolCategoryId, string> = {
  pokemon: "PokemonTCG",
  "one-piece": "OnePieceTCG",
  lorcana: "Lorcana",
  riftbound: "riftboundtcg",
  gundam: "gundamcardgame",
};

export type HypeSignals = {
  tournament: TournamentSignal;
  buzz: BuzzSignal;
  cached: boolean;
};

type CachedSignal<T> = { storedAt: number; value: T };

const memoryCache = new Map<string, { storedAt: number; value: TournamentSignal | BuzzSignal }>();

function cacheKey(category: string, kind: "tournament" | "buzz"): string {
  return `signals/${category}/${kind}`;
}

function cacheTtl(status: string): number {
  return status === "ok" ? CACHE_TTL_MS : FAIL_TTL_MS;
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

async function loadTournament(category: ToolCategoryId): Promise<TournamentSignal> {
  const gameId = LIMITLESS_GAME[category];
  if (!gameId) {
    return {
      status: "skipped",
      detail: "No keyless tournament source for this game.",
      gameId: null,
      decklists: 0,
      copies: {},
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
      detail: "Limitless did not respond.",
      gameId,
      decklists: 0,
      copies: {},
    };
  }
  if (!list.ok) {
    return {
      status: "unavailable",
      detail: `Limitless tournaments returned ${list.status}.`,
      gameId,
      decklists: 0,
      copies: {},
    };
  }
  let rows: { id?: string; players?: number }[] = [];
  try {
    const parsed = JSON.parse(list.text) as unknown;
    if (Array.isArray(parsed)) rows = parsed as { id?: string; players?: number }[];
  } catch {
    return {
      status: "unavailable",
      detail: "Limitless tournaments were not readable.",
      gameId,
      decklists: 0,
      copies: {},
    };
  }
  const ids = rows
    .filter((row) => typeof row.id === "string" && row.id)
    .sort((a, b) => (b.players || 0) - (a.players || 0))
    .slice(0, 6)
    .map((row) => row.id as string);
  if (!ids.length) {
    return {
      status: "unavailable",
      detail: "Limitless listed no recent events.",
      gameId,
      decklists: 0,
      copies: {},
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

  const cards = [];
  let decklists = 0;
  let responded = 0;
  for (const rows of standings) {
    if (rows.length) responded += 1;
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const decklist = (row as { decklist?: unknown }).decklist;
      if (!decklist) continue;
      const found = collectDeckCards(decklist);
      if (!found.length) continue;
      decklists += 1;
      cards.push(...found);
    }
  }
  if (!decklists) {
    return {
      status: "unavailable",
      detail: responded
        ? "Limitless responded, but the sampled events did not publish decklists."
        : "Limitless standings did not respond.",
      gameId,
      decklists: 0,
      copies: {},
    };
  }
  return {
    status: "ok",
    detail: `${decklists} public decklist${decklists === 1 ? "" : "s"} from Limitless (${gameId}).`,
    gameId,
    decklists,
    copies: tallyCopies(cards),
  };
}

async function loadBuzz(category: ToolCategoryId): Promise<BuzzSignal> {
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
    await new Promise((resolve) => setTimeout(resolve, 1500));
    try {
      res = await fetchText(
        `https://www.reddit.com/r/${encodeURIComponent(subreddit)}/.rss`,
        "application/atom+xml, application/rss+xml, text/xml",
      );
    } catch {
      res = { ok: false, status: 429, text: "" };
    }
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

function readCached<T extends { status: string }>(raw: unknown, now: number): T | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as { storedAt?: unknown; value?: T };
  if (typeof value.storedAt !== "number" || !value.value || typeof value.value.status !== "string") {
    return null;
  }
  if (now - value.storedAt > cacheTtl(value.value.status)) return null;
  return value.value;
}

async function loadCached<T extends { status: string }>(
  category: ToolCategoryId,
  kind: "tournament" | "buzz",
  now: number,
  load: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const key = cacheKey(category, kind);
  const memorized = memoryCache.get(key) as { storedAt: number; value: T } | undefined;
  if (memorized && now - memorized.storedAt <= cacheTtl(memorized.value.status)) {
    return { value: memorized.value, cached: true };
  }
  if (!memorized) {
    try {
      const stored = readCached<T>(await readToolJson(key), now);
      if (stored) {
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
  if (value.status === "ok") {
    try {
      await writeToolJson(key, fresh);
    } catch (err) {
      console.error("hype signal cache write failed:", err);
    }
  }
  return { value, cached: false };
}

export async function loadHypeSignals(category: ToolCategoryId, now = Date.now()): Promise<HypeSignals> {
  const [tournament, buzz] = await Promise.all([
    loadCached(category, "tournament", now, () => loadTournament(category)),
    loadCached(category, "buzz", now, () => loadBuzz(category)),
  ]);
  return {
    tournament: tournament.value,
    buzz: buzz.value,
    cached: tournament.cached && buzz.cached,
  };
}
