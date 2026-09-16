"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CardWithPrice,
  CardsMetaPriceSource,
  PokemonSet,
  SetStats,
  ViewMode,
} from "@/lib/types";
import { selectChaseCards, sortBySetNumber } from "@/lib/prices";
import {
  FREE_CHASE_LIMIT,
  PREMIUM_PRICE_LABEL,
  usePremium,
} from "@/hooks/usePremium";
import { SetSelector } from "./SetSelector";
import { ViewToggle } from "./ViewToggle";
import { CardTile } from "./CardTile";
import { StatusPanel } from "./StatusPanel";
import { PremiumGate } from "./PremiumGate";
import { SetStatsPanel } from "./SetStatsPanel";

/** How many blurred teaser tiles to show under the free chase list */
const LOCKED_TEASER_COUNT = 3;

export function ChaseApp() {
  const { isPremium, ready: premiumReady, unlockPremium, restoreFree } =
    usePremium();

  const [sets, setSets] = useState<PokemonSet[]>([]);
  const [setsLoading, setSetsLoading] = useState(true);
  const [setsError, setSetsError] = useState<string | null>(null);

  const [setId, setSetId] = useState("");
  const [mode, setMode] = useState<ViewMode>("chase");

  const [cards, setCards] = useState<CardWithPrice[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState<string | null>(null);
  const [pricedCount, setPricedCount] = useState(0);
  const [priceSource, setPriceSource] = useState<CardsMetaPriceSource | null>(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [setStats, setSetStats] = useState<SetStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSetsLoading(true);
      setSetsError(null);
      try {
        const res = await fetch("/api/sets");
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "Failed to load sets.");
        if (!cancelled) setSets(body.data as PokemonSet[]);
      } catch (e) {
        if (!cancelled) {
          setSetsError(e instanceof Error ? e.message : "Failed to load sets.");
        }
      } finally {
        if (!cancelled) setSetsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCards = useCallback(async (id: string, releaseDate?: string | null) => {
    if (!id) {
      setCards([]);
      setPricedCount(0);
      setPriceSource(null);
      setFallbackUsed(false);
      setSetStats(null);
      setCardsError(null);
      return;
    }
    setCardsLoading(true);
    setCardsError(null);
    setSetStats(null);
    try {
      const qs = new URLSearchParams();
      if (releaseDate) qs.set("releaseDate", releaseDate);
      const q = qs.toString();
      const res = await fetch(
        `/api/sets/${encodeURIComponent(id)}/cards${q ? `?${q}` : ""}`
      );
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Failed to load cards.");
      setCards(body.data as CardWithPrice[]);
      setPricedCount(body.meta?.pricedCount ?? 0);
      setPriceSource((body.meta?.priceSource as CardsMetaPriceSource) ?? null);
      setFallbackUsed(Boolean(body.meta?.fallbackUsed));
      setSetStats((body.meta?.stats as SetStats) ?? null);
    } catch (e) {
      setCards([]);
      setPricedCount(0);
      setPriceSource(null);
      setFallbackUsed(false);
      setSetStats(null);
      setCardsError(e instanceof Error ? e.message : "Failed to load cards.");
    } finally {
      setCardsLoading(false);
    }
  }, []);

  const selectedSet = sets.find((s) => s.id === setId);

  useEffect(() => {
    void loadCards(setId, selectedSet?.releaseDate ?? null);
  }, [setId, selectedSet?.releaseDate, loadCards]);

  const chaseCards = useMemo(() => selectChaseCards(cards), [cards]);
  const allSorted = useMemo(() => sortBySetNumber(cards), [cards]);

  const freeChaseVisible = useMemo(
    () => chaseCards.slice(0, FREE_CHASE_LIMIT),
    [chaseCards],
  );
  const lockedChaseRemainder = useMemo(
    () => chaseCards.slice(FREE_CHASE_LIMIT),
    [chaseCards],
  );
  const lockedTeasers = useMemo(
    () => lockedChaseRemainder.slice(0, LOCKED_TEASER_COUNT),
    [lockedChaseRemainder],
  );

  const lockedChaseCount = lockedChaseRemainder.length;
  const totalInSet = cards.length;
  const showFreeChaseSoftLock =
    !isPremium && mode === "chase" && lockedChaseCount > 0;
  const showEntireSetPaywall = !isPremium && mode === "all";

  const displayed = isPremium
    ? mode === "chase"
      ? chaseCards
      : allSorted
    : mode === "chase"
      ? freeChaseVisible
      : [];

  const showTcgdexNote =
    fallbackUsed || priceSource === "tcgdex" || priceSource === "mixed";

  const chaseSubtitle = (() => {
    if (!setId || cardsLoading || cardsError) return null;
    if (isPremium) {
      return mode === "chase"
        ? ` · showing top ${chaseCards.length} (≤20%, rounded up)`
        : " · sorted by set number";
    }
    if (mode === "chase") {
      const shown = Math.min(FREE_CHASE_LIMIT, chaseCards.length);
      return ` · Top ${shown} chase (free) · ${chaseCards.length} chase total`;
    }
    return " · Premium required";
  })();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">
            Pokémon TCG · Market chase
          </p>
          {premiumReady ? (
            <div className="flex flex-wrap items-center gap-2">
              {isPremium ? (
                <>
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    Premium
                  </span>
                  <button
                    type="button"
                    onClick={restoreFree}
                    className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                  >
                    Restore free
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={unlockPremium}
                  className="rounded-full bg-amber-400 px-3 py-1 text-[11px] font-bold text-slate-950 shadow hover:bg-amber-300"
                >
                  Unlock Premium · {PREMIUM_PRICE_LABEL}
                </button>
              )}
            </div>
          ) : null}
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Chase Cards
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          Pick a set, then toggle between{" "}
          <strong className="font-semibold text-amber-200">chase cards</strong>{" "}
          (top 20% by TCGPlayer market price among cards with a usable price,
          rounded up) and the entire set. Free shows the{" "}
          <strong className="font-semibold text-amber-200">top 3 chase</strong>
          ; Premium ({PREMIUM_PRICE_LABEL}) unlocks the full chase list and
          entire set. Prices come live from the Pokémon TCG API, with a TCGdex
          fallback when primary prices are missing — nothing is invented.
        </p>
      </header>

      <section className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur sm:p-5">
        {setsLoading ? (
          <StatusPanel variant="loading" title="Loading sets…" message="Fetching set list from the Pokémon TCG API." />
        ) : setsError ? (
          <StatusPanel
            variant="error"
            title="Couldn’t load sets"
            message={setsError}
          />
        ) : sets.length === 0 ? (
          <StatusPanel variant="empty" title="No sets available" message="The API returned an empty set list." />
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <SetSelector
              sets={sets}
              value={setId}
              onChange={setSetId}
              disabled={cardsLoading}
            />
            <ViewToggle
              mode={mode}
              onChange={setMode}
              chaseCount={setId && !cardsLoading && !cardsError ? chaseCards.length : null}
              totalCount={setId && !cardsLoading && !cardsError ? cards.length : null}
              disabled={!setId || cardsLoading}
              entireSetLocked={!isPremium}
            />
          </div>
        )}
      </section>

      {!setsLoading && !setsError && (
        <section className="space-y-4">
          {!setId ? (
            <StatusPanel
              variant="empty"
              title="Choose a set to begin"
              message="Select a Pokémon TCG set above to load cards and market prices."
            />
          ) : cardsLoading ? (
            <StatusPanel
              variant="loading"
              title={`Loading ${selectedSet?.name ?? "set"}…`}
              message="Fetching cards and market prices (Pokémon TCG API, with TCGdex fallback if needed)."
            />
          ) : cardsError ? (
            <StatusPanel variant="error" title="Couldn’t load cards" message={cardsError} />
          ) : cards.length === 0 ? (
            <StatusPanel
              variant="empty"
              title="No cards in this set"
              message="The API returned no cards for the selected set."
            />
          ) : (
            <>
              {setStats ? (
                <SetStatsPanel stats={setStats} setName={selectedSet?.name} />
              ) : null}

              {mode === "chase" && chaseCards.length === 0 ? (
                <StatusPanel
                  variant="empty"
                  title="No chase cards"
                  message={
                    fallbackUsed
                      ? `This set has ${cards.length} card${cards.length === 1 ? "" : "s"}, but neither the Pokémon TCG API nor TCGdex returned a usable TCGPlayer market price. Switch to Entire set to browse them, or try another set.`
                      : `This set has ${cards.length} card${cards.length === 1 ? "" : "s"}, but none have a usable TCGPlayer market price. Switch to Entire set to browse them, or try another set.`
                  }
                />
              ) : showEntireSetPaywall ? (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold text-white">
                      Entire set
                      {selectedSet ? (
                        <span className="ml-2 text-base font-normal text-slate-400">
                          · {selectedSet.name}
                        </span>
                      ) : null}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {totalInSet} cards in set · Premium unlocks full grid
                    </p>
                  </div>
                  <PremiumGate
                    variant="panel"
                    title={`${totalInSet} cards in this set`}
                    message={`Entire set view is a Premium feature (${PREMIUM_PRICE_LABEL}). Unlock to browse every card sorted by set number — plus the full chase list (top 20%).`}
                    onUnlock={unlockPremium}
                  />
                </>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-lg font-semibold text-white">
                      {mode === "chase"
                        ? isPremium
                          ? "Chase cards"
                          : "Top 3 chase"
                        : "Entire set"}
                      {selectedSet ? (
                        <span className="ml-2 text-base font-normal text-slate-400">
                          · {selectedSet.name}
                        </span>
                      ) : null}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {pricedCount} of {cards.length} cards have market prices
                      {chaseSubtitle}
                    </p>
                  </div>
                  {showTcgdexNote ? (
                    <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100/90">
                      Prices via TCGdex (TCGPlayer)
                      {priceSource === "mixed" ? " · mixed with Pokémon TCG API" : ""}
                    </p>
                  ) : null}
                  {displayed.length > 0 ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                      {displayed.map((card, i) => (
                        <CardTile
                          key={card.id}
                          card={card}
                          rank={mode === "chase" ? i + 1 : undefined}
                        />
                      ))}
                    </div>
                  ) : null}

                  {showFreeChaseSoftLock ? (
                    <div className="space-y-4 pt-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-200/80">
                          Locked · {lockedChaseCount} more chase · {totalInSet} in set
                        </h3>
                        <p className="text-xs text-slate-500">
                          Free shows top {FREE_CHASE_LIMIT} only
                        </p>
                      </div>
                      {lockedTeasers.length > 0 ? (
                        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                          {lockedTeasers.map((card, i) => (
                            <CardTile
                              key={`locked-${card.id}`}
                              card={card}
                              rank={FREE_CHASE_LIMIT + i + 1}
                              locked
                            />
                          ))}
                        </div>
                      ) : null}
                      <PremiumGate
                        variant="inline"
                        title={`${lockedChaseCount} more chase · ${totalInSet} in set`}
                        message={`Unlock Premium for ${PREMIUM_PRICE_LABEL} to see the remaining chase cards (full top 20%) and browse the entire set.`}
                        onUnlock={unlockPremium}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </section>
      )}

      <footer className="border-t border-white/5 pt-6 text-center text-xs text-slate-500">
        Data © Pokémon / The Pokémon Company International · Market prices via{" "}
        <a
          className="text-amber-300/80 underline-offset-2 hover:underline"
          href="https://docs.pokemontcg.io"
          target="_blank"
          rel="noreferrer"
        >
          Pokémon TCG API
        </a>{" "}
        (TCGPlayer when present), with{" "}
        <a
          className="text-amber-300/80 underline-offset-2 hover:underline"
          href="https://tcgdex.dev"
          target="_blank"
          rel="noreferrer"
        >
          TCGdex
        </a>{" "}
        as fallback. Not affiliated with Nintendo or TPC.
        {!isPremium && premiumReady ? (
          <>
            {" "}
            · Free: top {FREE_CHASE_LIMIT} chase · Premium {PREMIUM_PRICE_LABEL}{" "}
            unlocks full chase + entire set (demo, no payment).
          </>
        ) : null}
      </footer>
    </div>
  );
}
