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
  DEFAULT_CATEGORY_ID,
  getCategory,
  type CategoryId,
} from "@/lib/catalog/types";
import {
  FREE_CHASE_LIMIT,
  PREMIUM_PRICE_LABEL,
  categoryEntitlementHint,
  entitlementBadgeLabel,
} from "@/lib/entitlements";
import { useEntitlements } from "@/hooks/useEntitlements";
import { SetSelector } from "./SetSelector";
import { ViewToggle } from "./ViewToggle";
import { CardTile } from "./CardTile";
import { StatusPanel } from "./StatusPanel";
import { PremiumGate } from "./PremiumGate";
import { SetStatsPanel } from "./SetStatsPanel";
import { CategorySwitcher } from "./CategorySwitcher";
import { EntitlementShop } from "./EntitlementShop";

/** How many blurred teaser tiles to show under the free chase list */
const LOCKED_TEASER_COUNT = 3;

export function ChaseApp() {
  const {
    entitlements,
    ready: entitlementsReady,
    isPremium,
    ownsCategory,
    hasFullAccessInCategory,
    unlockPremium,
    unlockAddon,
    unlockAllAccess,
    restoreFree,
  } = useEntitlements();

  const [categoryId, setCategoryId] = useState<CategoryId>(DEFAULT_CATEGORY_ID);
  const category = getCategory(categoryId);
  const isPokemon = categoryId === "pokemon";
  const fullAccessHere = hasFullAccessInCategory(categoryId);
  const categoryHint = categoryEntitlementHint(entitlements, categoryId);

  const ownedIds = useMemo(() => {
    const ids: CategoryId[] = ["pokemon"];
    for (const id of entitlements.categories) {
      if (!ids.includes(id)) ids.push(id);
    }
    if (entitlements.allAccess) {
      for (const id of ["one-piece", "mtg", "sports"] as CategoryId[]) {
        if (!ids.includes(id)) ids.push(id);
      }
    }
    return ids;
  }, [entitlements]);

  const badge = entitlementBadgeLabel(entitlements);

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

  // Only load Pokémon sets when Pokémon is selected
  useEffect(() => {
    if (!isPokemon) {
      setSetsLoading(false);
      setSetsError(null);
      return;
    }
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
  }, [isPokemon]);

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
    if (!isPokemon) {
      setCards([]);
      setPricedCount(0);
      setPriceSource(null);
      setFallbackUsed(false);
      setSetStats(null);
      setCardsError(null);
      setCardsLoading(false);
      return;
    }
    void loadCards(setId, selectedSet?.releaseDate ?? null);
  }, [isPokemon, setId, selectedSet?.releaseDate, loadCards]);

  const handleCategoryChange = useCallback((id: CategoryId) => {
    setCategoryId(id);
    if (id !== "pokemon") {
      setSetId("");
      setMode("chase");
    }
  }, []);

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
    isPokemon && !fullAccessHere && mode === "chase" && lockedChaseCount > 0;
  const showEntireSetPaywall =
    isPokemon && !fullAccessHere && mode === "all";

  const displayed = fullAccessHere
    ? mode === "chase"
      ? chaseCards
      : allSorted
    : mode === "chase"
      ? freeChaseVisible
      : [];

  const showTcgdexNote =
    fallbackUsed || priceSource === "tcgdex" || priceSource === "mixed";

  const chaseSubtitle = (() => {
    if (!isPokemon || !setId || cardsLoading || cardsError) return null;
    if (fullAccessHere) {
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-5 sm:gap-8 sm:px-6 sm:py-8 lg:px-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">
            {isPokemon
              ? "Pokémon TCG · Market chase"
              : `${category.label} · Coming soon`}
          </p>
          {entitlementsReady ? (
            <div className="flex flex-wrap items-center gap-2">
              {badge ? (
                <>
                  <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    {badge}
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
                  className="min-h-11 rounded-full bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px]"
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
          Same chase experience across categories.{" "}
          <strong className="font-semibold text-amber-200">Pokémon</strong> is
          live today — free shows the{" "}
          <strong className="font-semibold text-amber-200">top 3 chase</strong>;
          Premium ({PREMIUM_PRICE_LABEL}) unlocks full chase + entire set.
          One Piece, MTG, and Sports are selectable now with coming-soon
          catalogs; add-ons ({"$2.99"}) or All Access ({"$29.99"}) reserve
          entitlement for when they go live.
        </p>
      </header>

      <section className="sticky top-0 z-20 space-y-4 rounded-2xl border border-white/10 bg-slate-950/95 p-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-lg shadow-black/20 backdrop-blur-md sm:p-5 sm:pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <CategorySwitcher
          value={categoryId}
          onChange={handleCategoryChange}
          ownedIds={ownedIds}
          disabled={isPokemon && cardsLoading}
        />

        {isPokemon ? (
          setsLoading ? (
            <StatusPanel
              variant="loading"
              title="Loading sets…"
              message="Fetching set list from the Pokémon TCG API."
            />
          ) : setsError ? (
            <StatusPanel
              variant="error"
              title="Couldn’t load sets"
              message={setsError}
            />
          ) : sets.length === 0 ? (
            <StatusPanel
              variant="empty"
              title="No sets available"
              message="The API returned an empty set list."
            />
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
                chaseCount={
                  setId && !cardsLoading && !cardsError
                    ? chaseCards.length
                    : null
                }
                totalCount={
                  setId && !cardsLoading && !cardsError ? cards.length : null
                }
                disabled={!setId || cardsLoading}
                entireSetLocked={!fullAccessHere}
              />
            </div>
          )
        ) : null}
      </section>

      {/* Non-Pokémon: coming soon + entitlement CTAs (no Pokémon API calls) */}
      {!isPokemon ? (
        <section className="space-y-4">
          <ComingSoonCategoryPanel
            categoryId={categoryId}
            hint={categoryHint}
            ownsThis={ownsCategory(categoryId)}
            hasPremium={isPremium}
            onUnlockAddon={() => unlockAddon(categoryId)}
            onUnlockAllAccess={unlockAllAccess}
            onUnlockPremium={unlockPremium}
          />
          <EntitlementShop
            entitlements={entitlements}
            onUnlockPremium={unlockPremium}
            onUnlockAddon={unlockAddon}
            onUnlockAllAccess={unlockAllAccess}
            onRestoreFree={restoreFree}
            highlightAddon={
              !ownsCategory(categoryId) ? categoryId : null
            }
          />
        </section>
      ) : null}

      {isPokemon && !setsLoading && !setsError ? (
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
            <StatusPanel
              variant="error"
              title="Couldn’t load cards"
              message={cardsError}
            />
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
                        ? fullAccessHere
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
                      {priceSource === "mixed"
                        ? " · mixed with Pokémon TCG API"
                        : ""}
                    </p>
                  ) : null}
                  {displayed.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
                          Locked · {lockedChaseCount} more chase · {totalInSet}{" "}
                          in set
                        </h3>
                        <p className="text-xs text-slate-500">
                          Free shows top {FREE_CHASE_LIMIT} only
                        </p>
                      </div>
                      {lockedTeasers.length > 0 ? (
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
      ) : null}

      {/* Shop always available for demos (collapsed feel on Pokémon via footer link area) */}
      {isPokemon && entitlementsReady ? (
        <EntitlementShop
          entitlements={entitlements}
          onUnlockPremium={unlockPremium}
          onUnlockAddon={unlockAddon}
          onUnlockAllAccess={unlockAllAccess}
          onRestoreFree={restoreFree}
          compact
        />
      ) : null}

      <footer className="border-t border-white/5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-500">
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
        {entitlementsReady ? (
          <>
            {" "}
            · Free: Pokémon top {FREE_CHASE_LIMIT} chase · Premium{" "}
            {PREMIUM_PRICE_LABEL} · Add-ons $2.99 · All Access $29.99 (demo, no
            payment).
          </>
        ) : null}
      </footer>
    </div>
  );
}

function ComingSoonCategoryPanel({
  categoryId,
  hint,
  ownsThis,
  hasPremium,
  onUnlockAddon,
  onUnlockAllAccess,
  onUnlockPremium,
}: {
  categoryId: CategoryId;
  hint: "live" | "entitled_coming_soon" | "locked_coming_soon";
  ownsThis: boolean;
  hasPremium: boolean;
  onUnlockAddon: () => void;
  onUnlockAllAccess: () => void;
  onUnlockPremium: () => void;
}) {
  const cat = getCategory(categoryId);

  if (hint === "entitled_coming_soon" || ownsThis) {
    return (
      <div
        className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-emerald-400/25 bg-emerald-950/20 px-6 py-10 text-center"
        role="status"
      >
        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
          You’re entitled
        </span>
        <h2 className="text-lg font-semibold text-white">
          {cat.label} catalog coming soon
        </h2>
        <p className="text-sm text-slate-300 opacity-90">
          Your entitlement is saved. The {cat.label} adapter isn’t live yet —
          sets and chase cards will appear here when the catalog ships. Pokémon
          remains fully available.
        </p>
      </div>
    );
  }

  return (
    <div
      className="mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-slate-900/80 to-slate-950/90 px-6 py-10 text-center shadow-lg shadow-amber-950/20"
      role="region"
      aria-label={`${cat.label} coming soon`}
    >
      <span className="rounded-full border border-amber-400/40 bg-amber-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
        Coming soon
      </span>
      <h2 className="text-lg font-semibold text-white">
        {cat.label} adapter not live yet
      </h2>
      <p className="max-w-sm text-sm text-slate-300 opacity-90">
        You can select this category now. Unlock the{" "}
        <strong className="text-amber-200">{cat.shortLabel} add-on</strong> (
        {cat.priceLabel}) or <strong className="text-violet-200">All Access</strong>{" "}
        ($29.99) to reserve entitlement for when the catalog goes live.
        {hasPremium
          ? " Premium covers Pokémon depth; other categories need an add-on or All Access."
          : " Premium ($4.99) unlocks full Pokémon chase today."}
      </p>
      <div className="flex w-full flex-col items-stretch gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-center">
        <button
          type="button"
          onClick={onUnlockAddon}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-950 shadow hover:bg-sky-300"
        >
          Unlock {cat.shortLabel} · {cat.priceLabel}
        </button>
        <button
          type="button"
          onClick={onUnlockAllAccess}
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-violet-400 px-4 py-3 text-sm font-bold text-slate-950 shadow hover:bg-violet-300"
        >
          All Access · $29.99
        </button>
        {!hasPremium ? (
          <button
            type="button"
            onClick={onUnlockPremium}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm font-semibold text-amber-100 hover:bg-amber-400/20"
          >
            Premium · {PREMIUM_PRICE_LABEL}
          </button>
        ) : null}
      </div>
      <span className="text-[11px] text-slate-500">Demo unlock · no payment</span>
    </div>
  );
}
