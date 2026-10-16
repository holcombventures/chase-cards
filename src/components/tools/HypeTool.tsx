"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { getCategory } from "@/lib/catalog/types";
import { formatPrice, formatPricesAsOf } from "@/lib/prices";
import { HYPE_CATEGORY_IDS, type HypeCategoryId } from "@/lib/tools/categories";
import {
  averageCopies,
  buzzPoints,
  countMentions,
  deckSharePoints,
  FAVORITES_EMPTY,
  hypeTotal,
  isNewOrUpcoming,
  normalizeCardName,
  playedAndPricey,
  REDDIT_BUSY_DETAIL,
  releaseTimingPoints,
  RIFTBOUND_NO_DECKS,
  swingEmptyLine,
  swingMatches,
  swingUnlockLine,
  SWING_WINDOW_DAYS,
  type BuzzSignal,
  type SwingDirection,
  type SwingWindow,
  type TournamentSignal,
  type WindowMovement,
} from "@/lib/tools/hypeScore";
import { hypeSharePath } from "@/lib/tools/shareLinks";
import type { CardWithPrice } from "@/lib/types";
import { ShareButtons } from "./ShareButtons";
import { CategoryPicker, FanDisclaimer, SetPicker, VerdictBadge } from "./ToolControls";
import { useToolCatalog } from "./useToolCatalog";

const WATCH_KEY = "chase-cards-hype-watchlist";
const VIEW_KEY = "chase-cards-hype-view";
const HOW_KEY = "chase-cards-hype-how";
const SEEN_KEY = "chase-cards-hype-seen";
const TARGET_KEY = "chase-cards-hype-targets";
const CARD_CACHE_KEY = "chase-cards-hype-cards";
const CARD_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type HypeView = "hot" | "favorites" | "tournaments" | "swings" | "upcoming";
type PriceBand = "under" | "over";

type WatchItem = {
  category: HypeCategoryId;
  setId: string;
  cardId: string;
  name: string;
  setName?: string;
};

type CachedCard = { id: string; name: string; marketPrice: number | null };
type CachedSet = {
  at: number;
  setName: string;
  releaseDate: string | null;
  cards: CachedCard[];
};
type CardCache = Record<string, CachedSet>;

type SignalBody = { tournament: TournamentSignal; buzz: BuzzSignal };

type ObserveBody = {
  recorded: boolean;
  points: number;
  windows?: Partial<Record<SwingWindow, Record<string, WindowMovement>>>;
  detail?: string;
};

const VIEWS: { id: HypeView; label: string; tooltip: string; explanation: string }[] = [
  {
    id: "hot",
    label: "What's hot",
    tooltip: "Cards at $1 or more, ranked by a 0–100 hype score.",
    explanation:
      "Cards at $1 or more, ranked by a 0–100 hype score. The score mixes how often the card shows up in recent decks, how often people are posting about it, and how new the set is. Open a card to see the points behind the number.",
  },
  {
    id: "favorites",
    label: "My favorites",
    tooltip: "Starred cards saved in this browser, across every game and set.",
    explanation:
      "Stars you tap are saved in this browser. No account. This list shows every starred card, the price change since you last opened it, and a 7-day change once daily snapshots exist. Type a target price to highlight a card that has reached it.",
  },
  {
    id: "tournaments",
    label: "Tournament cards",
    tooltip: "Share of recent decklists that play the card. The window is the last 6 big events.",
    explanation:
      "This is the share of recent Limitless decklists that include the card. A deck counts once, not once per copy. Average copies is how many they play when they play it. The window is the last 6 big events.",
  },
  {
    id: "swings",
    label: "Price swings",
    tooltip: "Biggest percent moves over 24 hours, 7 days, or 30 days.",
    explanation:
      "These are the biggest price moves versus the snapshot from 24 hours, 7 days, or 30 days ago. Only cards at $1 or more are listed. History fills in after the daily snapshot has been running.",
  },
  {
    id: "upcoming",
    label: "New & upcoming sets",
    tooltip: "Sets from the last 45 days and sets that are not out yet.",
    explanation:
      "Sets that came out in the last 45 days, and sets with a known future release date. Each one lists its priciest cards and how much people are posting about them.",
  },
];

const storeListeners = new Set<() => void>();

function subscribeStore(listener: () => void) {
  storeListeners.add(listener);
  return () => {
    storeListeners.delete(listener);
  };
}

function emitStore() {
  for (const listener of storeListeners) listener();
}

function readRaw(key: string, fallback: string): string {
  return window.localStorage.getItem(key) ?? fallback;
}

function writeRaw(key: string, value: string) {
  window.localStorage.setItem(key, value);
  emitStore();
}

function isView(value: string | null): value is HypeView {
  return (
    value === "hot" ||
    value === "favorites" ||
    value === "tournaments" ||
    value === "swings" ||
    value === "upcoming"
  );
}

function viewClient(): HypeView {
  const query = new URLSearchParams(window.location.search).get("view");
  if (isView(query)) return query;
  const stored = window.localStorage.getItem(VIEW_KEY);
  if (isView(stored)) return stored;
  return "hot";
}

function howClient(): boolean {
  return window.localStorage.getItem(HOW_KEY) !== "closed";
}

let seenFrozen: string | null = null;

function seenClient(): string {
  if (seenFrozen === null) seenFrozen = window.localStorage.getItem(SEEN_KEY) || "{}";
  return seenFrozen;
}

function rememberSeen(next: Record<string, number>) {
  let previous: Record<string, number> = {};
  try {
    previous = JSON.parse(window.localStorage.getItem(SEEN_KEY) || "{}") as Record<string, number>;
  } catch {
    previous = {};
  }
  const merged: Record<string, number> = {};
  for (const [key, price] of Object.entries(previous)) {
    if (typeof price === "number") merged[key] = price;
  }
  for (const [key, price] of Object.entries(next)) merged[key] = price;
  window.localStorage.setItem(SEEN_KEY, JSON.stringify(merged));
}

function parseWatch(raw: string): WatchItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WatchItem => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<WatchItem>;
      return (
        typeof row.category === "string" &&
        (HYPE_CATEGORY_IDS as readonly string[]).includes(row.category) &&
        typeof row.setId === "string" &&
        typeof row.cardId === "string" &&
        typeof row.name === "string"
      );
    });
  } catch {
    return [];
  }
}

function parseNumberMap(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function parseCardCache(raw: string): CardCache {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as CardCache;
  } catch {
    return {};
  }
}

function cacheKey(category: string, setId: string): string {
  return `${category}/${setId}`;
}

function favoriteKey(item: { category: string; setId: string; cardId: string }): string {
  return `${item.category}/${item.setId}/${item.cardId}`;
}

function signedChange(from: number, to: number): string {
  const delta = to - from;
  const sign = delta > 0 ? "+" : "";
  const money = formatPrice(delta);
  const percent = from > 0 ? (delta / from) * 100 : null;
  const pct = percent === null ? "" : ` (${sign}${percent.toFixed(1)}%)`;
  return `${money}${pct}`;
}

function formatCopies(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function HypeTool() {
  const catalog = useToolCatalog({ categories: HYPE_CATEGORY_IDS });
  const view = useSyncExternalStore(subscribeStore, viewClient, () => "hot" as const);
  const howOpen = useSyncExternalStore(subscribeStore, howClient, () => true);
  const watchRaw = useSyncExternalStore(subscribeStore, () => readRaw(WATCH_KEY, "[]"), () => "[]");
  const parsedWatch = useMemo(() => parseWatch(watchRaw), [watchRaw]);
  const seenRaw = useSyncExternalStore(subscribeStore, seenClient, () => "{}");
  const seen = useMemo(() => parseNumberMap(seenRaw), [seenRaw]);
  const targetRaw = useSyncExternalStore(subscribeStore, () => readRaw(TARGET_KEY, "{}"), () => "{}");
  const targets = useMemo(() => parseNumberMap(targetRaw), [targetRaw]);
  const cacheRaw = useSyncExternalStore(subscribeStore, () => readRaw(CARD_CACHE_KEY, "{}"), () => "{}");
  const cardCache = useMemo(() => parseCardCache(cacheRaw), [cacheRaw]);

  const [signalState, setSignalState] = useState<{
    category: HypeCategoryId;
    body: SignalBody | null;
    error: string | null;
  } | null>(null);
  const [observeBySet, setObserveBySet] = useState<Record<string, ObserveBody>>({});
  const [pickedId, setPickedId] = useState("");
  const [swingWindow, setSwingWindow] = useState<SwingWindow>("7d");
  const [direction, setDirection] = useState<SwingDirection>("both");
  const [threshold, setThreshold] = useState(10);
  const [band, setBand] = useState<PriceBand>("under");
  const seenSaved = useRef(false);
  const observeStarted = useRef(new Set<string>());
  const cardFetchStarted = useRef(new Set<string>());

  const signals = signalState?.category === catalog.category ? signalState.body : null;
  const signalError = signalState?.category === catalog.category ? signalState.error : null;
  const selectedKey = catalog.selected ? cacheKey(catalog.category, catalog.selected.id) : "";
  const observe = selectedKey ? observeBySet[selectedKey] : undefined;

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("view");
    if (isView(query)) {
      window.localStorage.setItem(VIEW_KEY, query);
      return;
    }
    const stored = window.localStorage.getItem(VIEW_KEY);
    const next = isView(stored) ? stored : "hot";
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
    emitStore();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const category = catalog.category;
    fetch(`/api/tools/signals?category=${encodeURIComponent(category)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as SignalBody & { error?: string };
        if (!res.ok) throw new Error(body.error || "Signals failed.");
        if (controller.signal.aborted) return;
        setSignalState({ category, body, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSignalState({
          category,
          body: null,
          error: err instanceof Error ? err.message : "Signals failed.",
        });
      });
    return () => controller.abort();
  }, [catalog.category]);

  useEffect(() => {
    const wanted = new Map<string, { category: string; setId: string }>();
    if (catalog.selected) {
      wanted.set(cacheKey(catalog.category, catalog.selected.id), {
        category: catalog.category,
        setId: catalog.selected.id,
      });
    }
    if (view === "favorites") {
      for (const item of parsedWatch) {
        wanted.set(cacheKey(item.category, item.setId), { category: item.category, setId: item.setId });
      }
    }
    const controller = new AbortController();
    const started: string[] = [];
    const finished = new Set<string>();
    for (const [key, target] of wanted) {
      if (observeStarted.current.has(key)) continue;
      observeStarted.current.add(key);
      started.push(key);
      const params = new URLSearchParams({ category: target.category, setId: target.setId });
      fetch(`/api/tools/observe?${params}`, { signal: controller.signal })
        .then(async (res) => {
          if (!res.ok || controller.signal.aborted) return;
          const body = (await res.json()) as ObserveBody;
          finished.add(key);
          setObserveBySet((current) => (current[key] ? current : { ...current, [key]: body }));
        })
        .catch(() => {
          observeStarted.current.delete(key);
        });
    }
    return () => {
      controller.abort();
      for (const key of started) {
        if (!finished.has(key)) observeStarted.current.delete(key);
      }
    };
  }, [catalog.category, catalog.selected, parsedWatch, view]);

  useEffect(() => {
    const wanted: { category: HypeCategoryId; setId: string; setName: string; releaseDate: string | null }[] = [];
    if (view === "favorites") {
      const seenSets = new Set<string>();
      for (const item of parsedWatch) {
        const key = cacheKey(item.category, item.setId);
        if (seenSets.has(key)) continue;
        seenSets.add(key);
        const cached = parseCardCache(window.localStorage.getItem(CARD_CACHE_KEY) || "{}")[key];
        if ((cached && Date.now() - cached.at < CARD_CACHE_TTL_MS) || cardFetchStarted.current.has(key)) continue;
        cardFetchStarted.current.add(key);
        wanted.push({
          category: item.category,
          setId: item.setId,
          setName: item.setName || cached?.setName || item.setId,
          releaseDate: cached?.releaseDate ?? null,
        });
      }
    }
    if (view === "upcoming") {
      for (const set of catalog.sets.filter((entry) => isNewOrUpcoming(entry.releaseDate)).slice(0, 6)) {
        const key = cacheKey(catalog.category, set.id);
        const cached = parseCardCache(window.localStorage.getItem(CARD_CACHE_KEY) || "{}")[key];
        if ((cached && Date.now() - cached.at < CARD_CACHE_TTL_MS) || cardFetchStarted.current.has(key)) continue;
        cardFetchStarted.current.add(key);
        wanted.push({
          category: catalog.category,
          setId: set.id,
          setName: set.name,
          releaseDate: set.releaseDate,
        });
      }
    }
    if (!wanted.length) return;
    const controller = new AbortController();
    const started = wanted.slice(0, 8).map((target) => cacheKey(target.category, target.setId));
    const finished = new Set<string>();
    for (const target of wanted.slice(0, 8)) {
      const key = cacheKey(target.category, target.setId);
      const params = new URLSearchParams({ category: target.category });
      if (target.releaseDate) params.set("releaseDate", target.releaseDate);
      if (target.setName) params.set("setName", target.setName);
      fetch(`/api/sets/${encodeURIComponent(target.setId)}/cards?${params}`, { signal: controller.signal })
        .then(async (res) => {
          const body = (await res.json()) as { data?: CardWithPrice[] };
          if (!res.ok || !Array.isArray(body.data) || controller.signal.aborted) {
            cardFetchStarted.current.delete(key);
            return;
          }
          const cards = body.data.map((card) => ({
            id: card.id,
            name: card.name,
            marketPrice: card.marketPrice,
          }));
          const next = parseCardCache(window.localStorage.getItem(CARD_CACHE_KEY) || "{}");
          next[key] = {
            at: Date.now(),
            setName: target.setName,
            releaseDate: target.releaseDate,
            cards,
          };
          finished.add(key);
          writeRaw(CARD_CACHE_KEY, JSON.stringify(next));
        })
        .catch(() => {
          cardFetchStarted.current.delete(key);
        });
    }
    return () => {
      controller.abort();
      for (const key of started) {
        if (!finished.has(key)) cardFetchStarted.current.delete(key);
      }
    };
  }, [catalog.category, catalog.sets, parsedWatch, view]);

  function setView(next: HypeView) {
    window.localStorage.setItem(VIEW_KEY, next);
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url);
    emitStore();
  }

  function toggleWatch(item: WatchItem) {
    const exists = parsedWatch.some(
      (row) => row.category === item.category && row.setId === item.setId && row.cardId === item.cardId,
    );
    const next = exists
      ? parsedWatch.filter(
          (row) => !(row.category === item.category && row.setId === item.setId && row.cardId === item.cardId),
        )
      : [...parsedWatch, item];
    writeRaw(WATCH_KEY, JSON.stringify(next));
  }

  function isStarred(category: string, setId: string, cardId: string): boolean {
    return parsedWatch.some((row) => row.category === category && row.setId === setId && row.cardId === cardId);
  }

  const releaseDate = catalog.selected?.releaseDate || catalog.meta?.releaseDate || null;
  const timing = releaseTimingPoints(releaseDate);
  const tournamentOk = signals?.tournament.status === "ok" && Boolean(signals.tournament.decks);
  const buzzOk = signals?.buzz.status === "ok";
  const posts = signals?.buzz.status === "ok" ? signals.buzz.posts : [];

  const scored = catalog.cards
      .filter((card) => card.marketPrice !== null && (card.marketPrice as number) >= 1)
      .map((card) => {
        const key = normalizeCardName(card.name);
        const decks = tournamentOk ? signals?.tournament.decks[key] ?? 0 : null;
        const copies = tournamentOk ? signals?.tournament.copies[key] ?? 0 : null;
        const decklists = signals?.tournament.decklists ?? 0;
        const mentions = buzzOk ? countMentions(card.name, posts) : null;
        const tournament = decks === null ? null : deckSharePoints(decks, decklists);
        const buzz = mentions === null ? null : buzzPoints(mentions);
        const total = hypeTotal({
          timing: timing.status === "ok" ? timing.points : null,
          tournament,
          buzz,
        });
        const share = decks === null || decklists <= 0 ? null : decks / decklists;
        return { card, decks, copies, decklists, mentions, tournament, buzz, total, share, timing };
      });

  const hotRows = [...scored]
    .sort(
      (a, b) =>
        b.total.total - a.total.total ||
        (b.card.marketPrice as number) - (a.card.marketPrice as number),
    )
    .slice(0, 20);
  const picked = hotRows.find((row) => row.card.id === pickedId) ?? hotRows[0] ?? null;

  const favoriteRows = useMemo(() => {
    return parsedWatch.map((item) => {
      const key = cacheKey(item.category, item.setId);
      const cached = cardCache[key];
      const card = cached?.cards.find((entry) => entry.id === item.cardId);
      const price = card?.marketPrice ?? null;
      const movement = observeBySet[key]?.windows?.["7d"]?.[item.cardId];
      return {
        item,
        price,
        setName: item.setName || cached?.setName || item.setId,
        game: getCategory(item.category).label,
        movement,
      };
    });
  }, [cardCache, observeBySet, parsedWatch]);

  useEffect(() => {
    if (view !== "favorites" || seenSaved.current || !favoriteRows.length) return;
    const next: Record<string, number> = {};
    for (const row of favoriteRows) {
      if (row.price === null) continue;
      next[favoriteKey(row.item)] = row.price;
    }
    if (!Object.keys(next).length) return;
    rememberSeen(next);
    seenSaved.current = true;
  }, [favoriteRows, view]);

  const asOf = formatPricesAsOf(catalog.meta?.pricesAsOf);
  const active = VIEWS.find((entry) => entry.id === view) ?? VIEWS[0];
  const sharePath =
    catalog.selected && picked
      ? hypeSharePath({
          category: catalog.category,
          setId: catalog.selected.id,
          setName: catalog.selected.name,
          releaseDate: catalog.selected.releaseDate,
          cardId: picked.card.id,
        })
      : "";

  const statusBits: string[] = [];
  if (signals?.buzz.status === "busy") statusBits.push(REDDIT_BUSY_DETAIL);
  else if (signals?.buzz.status === "ok") {
    statusBits.push(`Reddit posts from r/${signals.buzz.subreddit} are included.`);
  } else if (signals?.buzz.status === "skipped") {
    statusBits.push("This game has no public Reddit feed here, so hype uses the other signals.");
  } else if (signals || signalError) {
    statusBits.push("Reddit didn't load, so hype uses the other signals.");
  } else {
    statusBits.push("Checking Reddit and tournament results.");
  }
  if (signals?.tournament.status === "ok") statusBits.push("Tournaments cover the last 6 big events.");
  else if (signals?.tournament.detail) statusBits.push(signals.tournament.detail);
  statusBits.push(asOf ? `${asOf}.` : "Card prices come from the live catalog.");
  if (observe?.detail) statusBits.push(observe.detail);

  const upcomingSets = catalog.sets.filter((set) => isNewOrUpcoming(set.releaseDate));
  const selectedOutside =
    catalog.selected && !isNewOrUpcoming(catalog.selected.releaseDate) ? catalog.selected : null;

  function starFor(cardId: string, name: string) {
    if (!catalog.selected) return null;
    const item: WatchItem = {
      category: catalog.category,
      setId: catalog.selected.id,
      cardId,
      name,
      setName: catalog.selected.name,
    };
    return (
      <StarButton
        on={isStarred(item.category, item.setId, item.cardId)}
        onClick={() => toggleWatch(item)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Hype tracker</h1>
        <p className="text-sm text-slate-200">See which cards are heating up, and why</p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5">
        <button
          type="button"
          className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-white"
          aria-expanded={howOpen}
          onClick={() => writeRaw(HOW_KEY, howOpen ? "closed" : "open")}
        >
          How this works
          <span className="text-xs font-medium text-slate-400">{howOpen ? "Hide" : "Show"}</span>
        </button>
        {howOpen ? (
          <ol className="list-decimal space-y-1 px-8 pb-4 text-sm leading-relaxed text-slate-300">
            <li>Pick what you want to track.</li>
            <li>Choose a game (and set).</li>
            <li>Tap ☆ to add favorites, saved in this browser, no account needed.</li>
          </ol>
        ) : null}
      </section>

      <div role="tablist" aria-label="What do you want to track?" className="grid gap-2 sm:grid-cols-5">
        {VIEWS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={view === entry.id}
            title={entry.tooltip}
            onClick={() => setView(entry.id)}
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
              view === entry.id
                ? "border-amber-300 bg-amber-400/15 text-white"
                : "border-white/10 bg-slate-950/40 text-slate-300"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <CategoryPicker
          value={catalog.category}
          ids={HYPE_CATEGORY_IDS}
          onChange={catalog.setCategory}
        />
        <SetPicker
          sets={catalog.sets}
          value={catalog.setId}
          onChange={catalog.setSetId}
          disabled={catalog.loading && catalog.sets.length === 0}
        />
      </div>

      <p className="max-w-3xl text-sm leading-relaxed text-slate-300">{active.explanation}</p>

      {view === "swings" ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Price window">
            {(["24h", "7d", "30d"] as const).map((id) => (
              <FilterButton
                key={id}
                pressed={swingWindow === id}
                title={id === "24h" ? "Compare with yesterday" : id === "7d" ? "Compare with 7 days ago" : "Compare with 30 days ago"}
                onClick={() => setSwingWindow(id)}
              >
                {id}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Direction">
            {(
              [
                ["both", "Both"],
                ["up", "Up"],
                ["down", "Down"],
              ] as const
            ).map(([id, label]) => (
              <FilterButton key={id} pressed={direction === id} onClick={() => setDirection(id)}>
                {label}
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Minimum move">
            {[5, 10, 20].map((value) => (
              <FilterButton
                key={value}
                pressed={threshold === value}
                title={`Only moves of at least ${value} percent`}
                onClick={() => setThreshold(value)}
              >
                ±{value}%
              </FilterButton>
            ))}
          </div>
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Price band">
            <FilterButton pressed={band === "under"} onClick={() => setBand("under")}>
              Under $60
            </FilterButton>
            <FilterButton pressed={band === "over"} onClick={() => setBand("over")}>
              $60 and over
            </FilterButton>
          </div>
        </div>
      ) : null}

      {catalog.error ? (
        <p className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {catalog.error}
        </p>
      ) : null}
      {catalog.loading && view !== "favorites" ? (
        <p className="text-sm text-slate-400">Loading live prices…</p>
      ) : null}

      <div data-hype-view={view}>
        {view === "hot" ? (
          <HotView
            rows={hotRows}
            pickedId={picked?.card.id ?? ""}
            onPick={setPickedId}
            starFor={starFor}
            sharePath={sharePath}
            filename={picked ? `${catalog.category}-${picked.card.id}-hype` : "hype"}
            loading={catalog.loading}
          />
        ) : null}
        {view === "favorites" ? (
          <FavoritesView
            rows={favoriteRows}
            seen={seen}
            targets={targets}
            onTarget={(key, value) => {
              const next = { ...targets };
              if (value === null) delete next[key];
              else next[key] = value;
              writeRaw(TARGET_KEY, JSON.stringify(next));
            }}
            onStar={toggleWatch}
          />
        ) : null}
        {view === "tournaments" ? (
          <TournamentView
            rows={scored}
            detail={signals?.tournament.detail ?? ""}
            ready={Boolean(signals)}
            starFor={starFor}
          />
        ) : null}
        {view === "swings" ? (
          <SwingView
            cards={catalog.cards}
            observe={observe}
            windowId={swingWindow}
            direction={direction}
            threshold={threshold}
            band={band}
            starFor={starFor}
            loading={catalog.loading}
          />
        ) : null}
        {view === "upcoming" ? (
          <UpcomingView
            sets={upcomingSets}
            category={catalog.category}
            cache={cardCache}
            posts={buzzOk ? posts : []}
            outsideName={selectedOutside?.name ?? null}
            loading={catalog.loading && catalog.sets.length === 0}
            starForSet={(setId, setName, cardId, name) => {
              const item: WatchItem = {
                category: catalog.category,
                setId,
                cardId,
                name,
                setName,
              };
              return (
                <StarButton
                  on={isStarred(catalog.category, setId, cardId)}
                  onClick={() => toggleWatch(item)}
                />
              );
            }}
          />
        ) : null}
      </div>

      <p data-hype-status className="text-xs leading-relaxed text-slate-400">
        {statusBits.join(" ")}
      </p>
      <FanDisclaimer category={catalog.category} />
    </div>
  );
}

function HotView({
  rows,
  pickedId,
  onPick,
  starFor,
  sharePath,
  filename,
  loading,
}: {
  rows: {
    card: CardWithPrice;
    decks: number | null;
    copies: number | null;
    mentions: number | null;
    tournament: number | null;
    buzz: number | null;
    total: { total: number; max: number; label: "Hot" | "Warm" | "Quiet" | "No signals" };
    timing: { status: string; points: number; max: number; label: string };
    share: number | null;
    decklists: number;
  }[];
  pickedId: string;
  onPick: (id: string) => void;
  starFor: (cardId: string, name: string) => ReactNode;
  sharePath: string;
  filename: string;
  loading: boolean;
}) {
  const picked = rows.find((row) => row.card.id === pickedId) ?? null;
  if (!rows.length) {
    return <p className="text-sm text-slate-300">{loading ? "Loading live prices…" : "No cards at $1 or more in this set."}</p>;
  }
  return (
    <div className="space-y-4">
      {picked ? (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">{picked.card.name}</h2>
              <p className="text-sm text-slate-300">
                {formatPrice(picked.card.marketPrice)} · hype {picked.total.total}/100
              </p>
            </div>
            <VerdictBadge verdict={picked.total.label} />
          </div>
          <ul className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <li title="Points from the share of decklists in the last 6 big events.">
              Tournaments {picked.tournament === null ? "not in this score" : `${picked.tournament}/45`}
              {picked.share === null ? "" : ` · in ${Math.round(picked.share * 100)}% of decks`}
            </li>
            <li title="Points from public Reddit posts that name the card.">
              Buzz {picked.buzz === null ? "not in this score" : `${picked.buzz}/35`}
              {picked.mentions === null ? "" : ` · ${picked.mentions} posts`}
            </li>
            <li title="Points from how new the set is.">
              Timing {picked.timing.status === "ok" ? `${picked.timing.points}/20` : "not in this score"} · {picked.timing.label}
            </li>
            <li title="Always out of 100. If a source is down, the remaining signals are stretched to 100.">
              Total {picked.total.total}/100
              {picked.tournament === null || picked.buzz === null || picked.timing.status !== "ok"
                ? " · rescaled to 100"
                : ""}
            </li>
          </ul>
          {sharePath ? <ShareButtons path={sharePath} filename={filename} /> : null}
        </section>
      ) : null}
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Card</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium" title="Always out of 100. If a source is down, the remaining signals are stretched to 100.">
                Hype
              </th>
              <th className="px-3 py-2 font-medium" title="The signals behind the score.">
                Why
              </th>
              <th className="px-3 py-2 font-medium">☆</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.card.id} className="border-t border-white/10">
                <td className="px-3 py-2">
                  <button type="button" onClick={() => onPick(row.card.id)} className="text-left font-medium text-white hover:text-amber-200">
                    {row.card.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-100">{formatPrice(row.card.marketPrice)}</td>
                <td className="px-3 py-2 text-white">{row.total.total}/100</td>
                <td className="px-3 py-2 text-slate-300">
                  <WhyChips row={row} />
                </td>
                <td className="px-3 py-2">{starFor(row.card.id, row.card.name)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function WhyChips({
  row,
}: {
  row: {
    card: CardWithPrice;
    decks: number | null;
    decklists: number;
    mentions: number | null;
    timing: { label: string; status: string };
  };
}) {
  const chips: string[] = [];
  if (row.decks !== null && row.decklists > 0) {
    chips.push(`In ${Math.round((row.decks / row.decklists) * 100)}% of decks`);
  }
  if (row.mentions) chips.push(`${row.mentions} Reddit post${row.mentions === 1 ? "" : "s"}`);
  if (row.timing.status === "ok") {
    const match = row.timing.label.match(/Released (\d+) day/);
    const today = row.timing.label === "Released 0 days ago" || row.timing.label === "Released 0 day ago";
    if (today) chips.push("Set out today");
    else if (match) chips.push(`Set out ${match[1]} day${match[1] === "1" ? "" : "s"}`);
    else if (row.timing.label.startsWith("Releases in")) {
      chips.push(row.timing.label.replace("Releases in", "Out in"));
    }
  }
  if (!chips.length) return <span>Score uses the signals that loaded</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((chip) => (
        <span key={chip} className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-200">
          {chip}
        </span>
      ))}
    </span>
  );
}

function FavoritesView({
  rows,
  seen,
  targets,
  onTarget,
  onStar,
}: {
  rows: {
    item: WatchItem;
    price: number | null;
    setName: string;
    game: string;
    movement: WindowMovement | undefined;
  }[];
  seen: Record<string, number>;
  targets: Record<string, number>;
  onTarget: (key: string, value: number | null) => void;
  onStar: (item: WatchItem) => void;
}) {
  if (!rows.length) return <p className="text-sm text-slate-200">{FAVORITES_EMPTY}</p>;
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium" title="Change since the last time you opened favorites.">
              Since last visit
            </th>
            <th className="px-3 py-2 font-medium" title="Change versus the snapshot from 7 days ago, once that history exists.">
              7-day
            </th>
            <th className="px-3 py-2 font-medium" title="Highlight this card when the live price is at or below your number.">
              Target
            </th>
            <th className="px-3 py-2 font-medium">☆</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = favoriteKey(row.item);
            const before = seen[key];
            const target = targets[key];
            const atTarget = row.price !== null && typeof target === "number" && row.price <= target;
            const week =
              row.movement?.status === "ready"
                ? signedChange(row.movement.from, row.movement.to)
                : "Not yet";
            return (
              <tr key={key} className={`border-t border-white/10 ${atTarget ? "bg-amber-400/10" : ""}`}>
                <td className="px-3 py-2">
                  <p className="font-medium text-white">{row.item.name}</p>
                  <p className="text-xs text-slate-400">
                    {row.game} · {row.setName}
                    {atTarget ? " · At target" : ""}
                  </p>
                </td>
                <td className="px-3 py-2 text-slate-100">{row.price === null ? "Loading price…" : formatPrice(row.price)}</td>
                <td className="px-3 py-2 text-slate-300">
                  {row.price === null || typeof before !== "number" ? "First look" : signedChange(before, row.price)}
                </td>
                <td className="px-3 py-2 text-slate-300">{week}</td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={`Target price for ${row.item.name}`}
                    value={typeof target === "number" ? String(target) : ""}
                    placeholder="Optional"
                    onChange={(event) => {
                      const raw = event.target.value.trim();
                      if (!raw) {
                        onTarget(key, null);
                        return;
                      }
                      const parsed = Number(raw);
                      if (Number.isFinite(parsed) && parsed >= 0) onTarget(key, parsed);
                    }}
                    className="w-24 rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2">
                  <StarButton on onClick={() => onStar(row.item)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TournamentView({
  rows,
  detail,
  ready,
  starFor,
}: {
  rows: {
    card: CardWithPrice;
    decks: number | null;
    copies: number | null;
    decklists: number;
    share: number | null;
  }[];
  detail: string;
  ready: boolean;
  starFor: (cardId: string, name: string) => ReactNode;
}) {
  if (!ready) return <p className="text-sm text-slate-300">Loading the last 6 big events…</p>;
  if (detail === RIFTBOUND_NO_DECKS) {
    return <p className="text-sm text-slate-200">{RIFTBOUND_NO_DECKS}</p>;
  }
  const played = rows
    .filter((row) => (row.decks ?? 0) > 0 && row.decklists > 0)
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0) || (b.card.marketPrice as number) - (a.card.marketPrice as number));
  if (!played.length) {
    return <p className="text-sm text-slate-200">{detail || "No sampled decklists include cards from this set."}</p>;
  }
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-300">Window: last 6 big events.</p>
      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Card</th>
              <th className="px-3 py-2 font-medium" title="Percent of decklists in the last 6 big events that include this card.">
                Played
              </th>
              <th className="px-3 py-2 font-medium" title="Copies played divided by the number of decks that include the card.">
                Avg copies
              </th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium" title="At least 10% of decks, and a price of $5 or more.">
                Flag
              </th>
              <th className="px-3 py-2 font-medium">☆</th>
            </tr>
          </thead>
          <tbody>
            {played.map((row) => {
              const avg = averageCopies(row.copies ?? 0, row.decks ?? 0);
              const flag = playedAndPricey(row.share, row.card.marketPrice);
              return (
                <tr key={row.card.id} className="border-t border-white/10">
                  <td className="px-3 py-2 font-medium text-white">{row.card.name}</td>
                  <td className="px-3 py-2 text-slate-100">{Math.round((row.share ?? 0) * 100)}% of decks</td>
                  <td className="px-3 py-2 text-slate-300">{avg === null ? "—" : formatCopies(avg)}</td>
                  <td className="px-3 py-2 text-slate-100">{formatPrice(row.card.marketPrice)}</td>
                  <td className="px-3 py-2 text-amber-200">{flag ? "Played + pricey" : ""}</td>
                  <td className="px-3 py-2">{starFor(row.card.id, row.card.name)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SwingView({
  cards,
  observe,
  windowId,
  direction,
  threshold,
  band,
  starFor,
  loading,
}: {
  cards: CardWithPrice[];
  observe: ObserveBody | undefined;
  windowId: SwingWindow;
  direction: SwingDirection;
  threshold: number;
  band: PriceBand;
  starFor: (cardId: string, name: string) => ReactNode;
  loading: boolean;
}) {
  if (loading && !cards.length) return <p className="text-sm text-slate-300">Loading live prices…</p>;
  const priced = cards.filter((card) => card.marketPrice !== null && (card.marketPrice as number) >= 1);
  const windows = observe?.windows?.[windowId];
  const sample = priced.flatMap((card) => {
    const movement = windows?.[card.id];
    return movement ? [movement] : [];
  });
  const ready = sample.some((movement) => movement.status === "ready");
  if (!observe || !ready) {
    const collecting = sample.find((movement) => movement.status === "collecting");
    const unlocksOn = collecting && collecting.status === "collecting" ? collecting.unlocksOn : null;
    return <p className="text-sm text-slate-200">{swingUnlockLine(windowId, unlocksOn)}</p>;
  }
  const rows = priced
    .flatMap((card) => {
      const movement = windows?.[card.id];
      if (!movement || movement.status !== "ready" || !swingMatches(movement, direction, threshold)) return [];
      const price = card.marketPrice as number;
      if (band === "under" ? price >= 60 : price < 60) return [];
      return [{ card, movement }];
    })
    .sort((a, b) => Math.abs((b.movement.percent ?? 0)) - Math.abs((a.movement.percent ?? 0)));
  if (!rows.length) {
    return <p className="text-sm text-slate-200">{swingEmptyLine(threshold, windowId)}</p>;
  }
  const phrase = windowId === "24h" ? "24 hours" : windowId === "30d" ? "30 days" : "7 days";
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">Card</th>
            <th className="px-3 py-2 font-medium">Price</th>
            <th className="px-3 py-2 font-medium" title={`Percent change across ${SWING_WINDOW_DAYS[windowId]} days.`}>
              Change
            </th>
            <th className="px-3 py-2 font-medium">Window</th>
            <th className="px-3 py-2 font-medium">☆</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.card.id} className="border-t border-white/10">
              <td className="px-3 py-2 font-medium text-white">{row.card.name}</td>
              <td className="px-3 py-2 text-slate-100">{formatPrice(row.card.marketPrice)}</td>
              <td className="px-3 py-2 text-slate-300">
                {row.movement.status === "ready" ? signedChange(row.movement.from, row.movement.to) : ""}
              </td>
              <td className="px-3 py-2 text-slate-300">{phrase}</td>
              <td className="px-3 py-2">{starFor(row.card.id, row.card.name)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UpcomingView({
  sets,
  category,
  cache,
  posts,
  outsideName,
  loading,
  starForSet,
}: {
  sets: { id: string; name: string; releaseDate: string }[];
  category: HypeCategoryId;
  cache: CardCache;
  posts: { text: string }[];
  outsideName: string | null;
  loading: boolean;
  starForSet: (setId: string, setName: string, cardId: string, name: string) => ReactNode;
}) {
  if (loading) return <p className="text-sm text-slate-300">Loading sets…</p>;
  if (!sets.length) {
    return (
      <p className="text-sm text-slate-200">
        No sets in the last 45 days, and no dated upcoming sets.
        {outsideName ? ` ${outsideName} is older than 45 days, so it isn't listed here.` : ""}
      </p>
    );
  }
  const ordered = [...sets].sort(
    (a, b) => Date.parse(b.releaseDate || "") - Date.parse(a.releaseDate || ""),
  );
  return (
    <div className="space-y-4">
      {outsideName ? (
        <p className="text-sm text-slate-400">{outsideName} is older than 45 days, so it isn&apos;t listed here.</p>
      ) : null}
      {ordered.slice(0, 8).map((set) => {
        const cached = cache[cacheKey(category, set.id)];
        const chase = (cached?.cards ?? [])
          .filter((card) => card.marketPrice !== null && (card.marketPrice as number) >= 1)
          .sort((a, b) => (b.marketPrice as number) - (a.marketPrice as number))
          .slice(0, 3);
        const timing = releaseTimingPoints(set.releaseDate);
        return (
          <section key={set.id} className="space-y-2 rounded-2xl border border-white/10 p-4">
            <h2 className="text-lg font-semibold text-white">{set.name}</h2>
            <p className="text-sm text-slate-300">{timing.label}</p>
            {cached ? null : <p className="text-sm text-slate-400">Loading chase cards…</p>}
            {cached && !chase.length ? <p className="text-sm text-slate-400">No chase cards at $1 or more yet.</p> : null}
            {chase.length ? (
              <ul className="space-y-1 text-sm text-slate-200">
                {chase.map((card) => {
                  const mentions = posts.length ? countMentions(card.name, posts) : 0;
                  return (
                    <li key={card.id} className="flex items-center justify-between gap-3">
                      <span>
                        {card.name} · {formatPrice(card.marketPrice)}
                        {mentions ? ` · ${mentions} Reddit post${mentions === 1 ? "" : "s"}` : ""}
                      </span>
                      {starForSet(set.id, set.name, card.id, card.name)}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function StarButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Remove favorite" : "Add favorite"}
      title={on ? "Remove favorite" : "Save in this browser"}
      onClick={onClick}
      className="text-lg leading-none text-amber-200"
    >
      {on ? "★" : "☆"}
    </button>
  );
}

function FilterButton({
  pressed,
  onClick,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  title?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      title={title}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${
        pressed ? "border-amber-300 bg-amber-400/15 text-white" : "border-white/15 text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}
