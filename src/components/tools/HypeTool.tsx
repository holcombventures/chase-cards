"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { formatPrice, formatPricesAsOf } from "@/lib/prices";
import type { ToolCategoryId } from "@/lib/tools/categories";
import {
  buzzPoints,
  countMentions,
  hypeTotal,
  normalizeCardName,
  releaseTimingPoints,
  tournamentPoints,
  type BuzzSignal,
  type PriceMovement,
  type TournamentSignal,
} from "@/lib/tools/hypeScore";
import { hypeSharePath } from "@/lib/tools/shareLinks";
import { ShareButtons } from "./ShareButtons";
import {
  CategoryPicker,
  FanDisclaimer,
  SetPicker,
  VerdictBadge,
} from "./ToolControls";
import { useToolCatalog } from "./useToolCatalog";

const WATCH_KEY = "chase-cards-hype-watchlist";

type WatchItem = {
  category: ToolCategoryId;
  setId: string;
  cardId: string;
  name: string;
};

type SignalBody = {
  tournament: TournamentSignal;
  buzz: BuzzSignal;
};

type ObserveBody = {
  recorded: boolean;
  points: number;
  movement: Record<string, PriceMovement>;
  detail?: string;
};

const watchListeners = new Set<() => void>();

function parseWatch(raw: string): WatchItem[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WatchItem => {
      if (!item || typeof item !== "object") return false;
      const row = item as Partial<WatchItem>;
      return (
        typeof row.category === "string" &&
        typeof row.setId === "string" &&
        typeof row.cardId === "string" &&
        typeof row.name === "string"
      );
    });
  } catch {
    return [];
  }
}

function watchSubscribe(listener: () => void) {
  watchListeners.add(listener);
  return () => watchListeners.delete(listener);
}

function watchSnapshot(): string {
  return window.localStorage.getItem(WATCH_KEY) || "[]";
}

function watchServerSnapshot(): string {
  return "[]";
}

function writeWatch(items: WatchItem[]) {
  window.localStorage.setItem(WATCH_KEY, JSON.stringify(items));
  for (const listener of watchListeners) listener();
}

function movementText(movement: PriceMovement | undefined): string {
  if (!movement || movement.status === "collecting") return "Collecting data";
  const sign = movement.delta > 0 ? "+" : "";
  const pct =
    movement.percent === null ? "" : ` (${sign}${movement.percent.toFixed(1)}%)`;
  return `${sign}${formatPrice(movement.delta)}${pct}`;
}

export function HypeTool() {
  const catalog = useToolCatalog();
  const [signalState, setSignalState] = useState<{
    category: ToolCategoryId;
    body: SignalBody | null;
    error: string | null;
  } | null>(null);
  const [observeState, setObserveState] = useState<{
    setId: string;
    body: ObserveBody;
  } | null>(null);
  const [watchOnly, setWatchOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState("");
  const watchRaw = useSyncExternalStore(watchSubscribe, watchSnapshot, watchServerSnapshot);
  const watch = useMemo(() => parseWatch(watchRaw), [watchRaw]);
  const signals = signalState?.category === catalog.category ? signalState.body : null;
  const signalError = signalState?.category === catalog.category ? signalState.error : null;
  const observe =
    observeState && observeState.setId === catalog.selected?.id ? observeState.body : null;

  useEffect(() => {
    const controller = new AbortController();
    const category = catalog.category;
    fetch(`/api/tools/signals?category=${encodeURIComponent(category)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as SignalBody & { error?: string };
        if (!res.ok) throw new Error(body.error || "Signals unavailable.");
        if (controller.signal.aborted) return;
        setSignalState({ category, body, error: null });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSignalState({
          category,
          body: null,
          error: err instanceof Error ? err.message : "Signals unavailable.",
        });
      });
    return () => controller.abort();
  }, [catalog.category]);

  useEffect(() => {
    if (!catalog.selected || catalog.loading) return;
    const controller = new AbortController();
    const setId = catalog.selected.id;
    const params = new URLSearchParams({
      category: catalog.category,
      setId,
    });
    fetch(`/api/tools/observe?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as ObserveBody;
        if (!res.ok || controller.signal.aborted) return;
        setObserveState({ setId, body });
      })
      .catch(() => {
        /* movement stays on "collecting data" when the log cannot be read */
      });
    return () => controller.abort();
  }, [catalog.category, catalog.selected, catalog.loading, catalog.meta?.pricesAsOf]);

  const rows = useMemo(() => {
    const timing = releaseTimingPoints(
      catalog.selected?.releaseDate || catalog.meta?.releaseDate || null,
    );
    const tournamentOk = signals?.tournament.status === "ok";
    const buzzOk = signals?.buzz.status === "ok";
    return catalog.cards
      .filter((card) => card.marketPrice !== null)
      .map((card) => {
        const copies = tournamentOk
          ? signals?.tournament.copies[normalizeCardName(card.name)] ?? 0
          : null;
        const mentions = buzzOk ? countMentions(card.name, signals?.buzz.posts ?? []) : null;
        const total = hypeTotal({
          timing: timing.status === "ok" ? timing.points : null,
          tournament: copies === null ? null : tournamentPoints(copies),
          buzz: mentions === null ? null : buzzPoints(mentions),
        });
        return {
          card,
          timing,
          copies,
          mentions,
          tournament: copies === null ? null : tournamentPoints(copies),
          buzz: mentions === null ? null : buzzPoints(mentions),
          total,
          movement: observe?.movement[card.id],
        };
      })
      .sort(
        (a, b) =>
          b.total.total - a.total.total ||
          (b.card.marketPrice as number) - (a.card.marketPrice as number),
      );
  }, [catalog.cards, catalog.meta?.releaseDate, catalog.selected?.releaseDate, observe?.movement, signals]);

  const watchedIds = new Set(
    watch.filter((item) => item.category === catalog.category).map((item) => item.cardId),
  );
  const needle = query.trim().toLowerCase();
  const shown = rows.filter((row) => {
    if (watchOnly && !watchedIds.has(row.card.id)) return false;
    if (needle && !row.card.name.toLowerCase().includes(needle)) return false;
    return true;
  });
  const visible = needle || watchOnly ? shown : shown.slice(0, 20);
  const picked = rows.find((row) => row.card.id === pickedId) ?? visible[0] ?? null;
  const asOf = formatPricesAsOf(catalog.meta?.pricesAsOf);
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

  function toggleWatch(cardId: string, name: string) {
    if (!catalog.selected) return;
    const exists = watch.some(
      (item) => item.category === catalog.category && item.cardId === cardId,
    );
    const next = exists
      ? watch.filter((item) => !(item.category === catalog.category && item.cardId === cardId))
      : [
          ...watch,
          {
            category: catalog.category,
            setId: catalog.selected.id,
            cardId,
            name,
          },
        ];
    writeWatch(next);
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">TCG hype tracker</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          Score uses set release timing, Limitless tournament copies, and public subreddit posts.
          Live prices come from the catalog. Price movement waits until this tool has logged two
          snapshots of its own.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <CategoryPicker value={catalog.category} onChange={catalog.setCategory} />
        <SetPicker
          sets={catalog.sets}
          value={catalog.setId}
          onChange={catalog.setSetId}
          disabled={catalog.loading && catalog.sets.length === 0}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <SignalLine
          label="Tournaments"
          status={signalError ? "unavailable" : signals?.tournament.status}
          detail={signalError || signals?.tournament.detail || "Loading Limitless…"}
        />
        <SignalLine
          label="Buzz"
          status={signalError ? "unavailable" : signals?.buzz.status}
          detail={signalError || signals?.buzz.detail || "Loading subreddit…"}
        />
      </div>
      <p className="text-xs text-slate-400">
        {observe?.detail || "Price movement: collecting data."}
        {asOf ? ` ${asOf}.` : ""}
      </p>

      {catalog.error ? (
        <p className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {catalog.error}
        </p>
      ) : null}
      {catalog.loading ? <p className="text-sm text-slate-400">Loading live prices…</p> : null}

      {picked ? (
        <section className="space-y-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">{picked.card.name}</h2>
              <p className="text-sm text-slate-300">
                Live {formatPrice(picked.card.marketPrice)} · score {picked.total.total}/
                {picked.total.max} · {movementText(picked.movement)}
              </p>
            </div>
            <VerdictBadge verdict={picked.total.label} />
          </div>
          <ScoreParts row={picked} />
          {sharePath ? (
            <ShareButtons path={sharePath} filename={`${catalog.category}-${picked.card.id}-hype`} />
          ) : null}
          <FanDisclaimer category={catalog.category} />
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter cards"
          className="rounded-xl border border-white/15 bg-slate-950 px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input
            type="checkbox"
            checked={watchOnly}
            onChange={(event) => setWatchOnly(event.target.checked)}
          />
          Watchlist only
        </label>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Card</th>
              <th className="px-3 py-2 font-medium">Price</th>
              <th className="px-3 py-2 font-medium">Move</th>
              <th className="px-3 py-2 font-medium">Timing</th>
              <th className="px-3 py-2 font-medium">Tournaments</th>
              <th className="px-3 py-2 font-medium">Buzz</th>
              <th className="px-3 py-2 font-medium">Score</th>
              <th className="px-3 py-2 font-medium">Watch</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.card.id} className="border-t border-white/10">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setPickedId(row.card.id)}
                    className="text-left font-medium text-white hover:text-amber-200"
                  >
                    {row.card.name}
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-100">{formatPrice(row.card.marketPrice)}</td>
                <td className="px-3 py-2 text-slate-300">{movementText(row.movement)}</td>
                <td className="px-3 py-2 text-slate-300">
                  {row.timing.status === "ok" ? `${row.timing.points}/${row.timing.max}` : "Unavailable"}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {row.tournament === null
                    ? "Unavailable"
                    : `${row.tournament}/35 · ${row.copies} copies`}
                </td>
                <td className="px-3 py-2 text-slate-300">
                  {row.buzz === null ? "Unavailable" : `${row.buzz}/25 · ${row.mentions} posts`}
                </td>
                <td className="px-3 py-2 text-white">
                  {row.total.label} {row.total.total}/{row.total.max}
                </td>
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => toggleWatch(row.card.id, row.card.name)}
                    className="text-xs font-semibold text-amber-200"
                  >
                    {watchedIds.has(row.card.id) ? "Watching" : "Watch"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!needle && !watchOnly && shown.length > visible.length ? (
        <p className="text-xs text-slate-400">
          Showing the top {visible.length} of {shown.length} priced cards. Filter to see the rest.
        </p>
      ) : null}

      <section className="space-y-2 text-sm leading-relaxed text-slate-300">
        <h2 className="text-base font-semibold text-white">How the score is built</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Timing, up to 40, comes from the set release date. Newer sets score higher.</li>
          <li>Tournaments, up to 35, count copies in recent public Limitless decklists. A game with no keyless decklists shows unavailable.</li>
          <li>Buzz, up to 25, counts recent posts on that game&apos;s public subreddit that name the card.</li>
          <li>A blocked source is left out of the total. It is not treated as zero usage.</li>
          <li>There is no upstream price history. This page logs the catalog snapshot it already loaded and says &quot;collecting data&quot; until two different snapshots exist.</li>
        </ul>
      </section>
    </div>
  );
}

function SignalLine({
  label,
  status,
  detail,
}: {
  label: string;
  status?: string;
  detail: string;
}) {
  const unavailable = status === "unavailable" || status === "skipped";
  return (
    <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-slate-300">
      <span className="font-semibold text-white">{label}: </span>
      <span className={unavailable ? "text-amber-200" : "text-emerald-200"}>
        {status === "ok" ? "Live" : status === "skipped" ? "Skipped" : status === "unavailable" ? "Unavailable" : "Loading"}
      </span>
      <span> — {detail}</span>
    </p>
  );
}

function ScoreParts({
  row,
}: {
  row: {
    timing: { status: string; points: number; max: number; label: string };
    tournament: number | null;
    buzz: number | null;
    copies: number | null;
    mentions: number | null;
  };
}) {
  return (
    <ul className="grid gap-2 text-sm text-slate-300 sm:grid-cols-3">
      <li>Timing {row.timing.status === "ok" ? `${row.timing.points}/${row.timing.max}` : "unavailable"} · {row.timing.label}</li>
      <li>
        Tournaments {row.tournament === null ? "unavailable" : `${row.tournament}/35`}
        {row.copies === null ? "" : ` · ${row.copies} copies`}
      </li>
      <li>
        Buzz {row.buzz === null ? "unavailable" : `${row.buzz}/25`}
        {row.mentions === null ? "" : ` · ${row.mentions} posts`}
      </li>
    </ul>
  );
}
