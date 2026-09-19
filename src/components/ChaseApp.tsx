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
  LIVE_CATALOG_IDS,
  getCategory,
  isLiveCategory,
  type CategoryId,
} from "@/lib/catalog/types";
import {
  ADDON_PRICE_LABEL,
  ALL_ACCESS_PRICE_LABEL,
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
import { PremiumGate, type GateAction } from "./PremiumGate";
import { SetStatsPanel } from "./SetStatsPanel";
import { CategorySwitcher } from "./CategorySwitcher";
import { EntitlementShop } from "./EntitlementShop";
import { isCheckoutEntitlementKey } from "@/lib/stripe/catalog";
import { confirmCheckoutSession } from "@/lib/stripe/startCheckout";
import { purchaseEntitlement } from "@/lib/stripe/checkoutClient";
import { fetchJsonWithRetry } from "@/lib/fetchJson";

/** How many blurred teaser tiles to show under the free chase list */
const LOCKED_TEASER_COUNT = 3;


function pickDefaultSetId(sets: PokemonSet[]): string {
  if (!sets.length) return "";
  // Prefer a set released at least 3 days ago so brand-new upstream gaps
  // are less likely to be the first thing a visitor hits.
  const cutoff = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const stable = sets.find((s) => {
    const raw = (s.releaseDate || "").replace(/\//g, "-");
    const t = Date.parse(raw);
    return Number.isFinite(t) && t <= cutoff;
  });
  return (stable ?? sets[0]).id;
}

export function ChaseApp() {
  const {
    entitlements,
    ready: entitlementsReady,
    isPremium,
    ownsCategory,
    hasFullAccessInCategory,
    unlockPremium,
    unlockAddon,
    unlockSport,
    unlockAllAccess,
    applyPaidEntitlements,
    restoreFree,
  } = useEntitlements();

  const [checkoutBanner, setCheckoutBanner] = useState<string | null>(null);
  const [checkoutBusy, setCheckoutBusy] = useState(false);

  // After Stripe redirect: ?checkout=success&session_id=… → confirm + grant
  useEffect(() => {
    if (!entitlementsReady || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;

    const cleanUrl = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("session_id");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };

    if (checkout === "cancel") {
      setCheckoutBanner("Checkout canceled — no charge was made.");
      cleanUrl();
      return;
    }

    if (checkout !== "success") return;
    const sessionId = params.get("session_id")?.trim();
    if (!sessionId) {
      setCheckoutBanner("Checkout returned without a session id.");
      cleanUrl();
      return;
    }

    let cancelled = false;
    (async () => {
      setCheckoutBusy(true);
      const result = await confirmCheckoutSession(sessionId);
      if (cancelled) return;
      if (result.paid && result.entitlements.length) {
        const keys = result.entitlements.filter(isCheckoutEntitlementKey);
        applyPaidEntitlements(keys, {
          premiumCategory: result.premiumCategory ?? undefined,
        });
        const catNote =
          result.premiumCategory && keys.includes("premium")
            ? ` (${result.premiumCategory})`
            : "";
        setCheckoutBanner(
          keys.length
            ? `Payment confirmed — unlocked ${keys.join(", ").replace(/_/g, " ")}${catNote}.`
            : "Payment confirmed.",
        );
      } else if (result.paid) {
        setCheckoutBanner(
          "Payment confirmed, but no matching price→entitlement mapping was found. Check Netlify STRIPE_PRICE_* env vars.",
        );
      } else {
        setCheckoutBanner(
          result.error || "Payment not confirmed yet. Try refreshing in a moment.",
        );
      }
      cleanUrl();
      setCheckoutBusy(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [entitlementsReady, applyPaidEntitlements]);

  const [pickingPremiumHeader, setPickingPremiumHeader] = useState(false);

  const buyPremiumFor = useCallback(
    async (categoryIdForPremium: CategoryId) => {
      setCheckoutBusy(true);
      try {
        await purchaseEntitlement("premium", {
          premiumCategory: categoryIdForPremium,
          onDemoFallback: () => unlockPremium(categoryIdForPremium),
          onStatus: (msg) => {
            if (msg && msg !== "Starting checkout…") setCheckoutBanner(msg);
          },
        });
        setPickingPremiumHeader(false);
      } finally {
        setCheckoutBusy(false);
      }
    },
    [unlockPremium],
  );

  const [categoryId, setCategoryId] = useState<CategoryId>(DEFAULT_CATEGORY_ID);
  const category = getCategory(categoryId);
  const catalogLive = isLiveCategory(categoryId);
  const isPokemon = categoryId === "pokemon";
  const isOnePiece = categoryId === "one-piece";
  const fullAccessHere = hasFullAccessInCategory(categoryId);
  const categoryHint = categoryEntitlementHint(entitlements, categoryId);
  const ownsThis = ownsCategory(categoryId);

  const ownedIds = useMemo(() => {
    // Freemium: live catalogs are always browsable (top-3). Badge "owned"
    // also includes premiumCategory + add-ons + all-access.
    const ids: CategoryId[] = [...LIVE_CATALOG_IDS];
    if (entitlements.premiumCategory) {
      if (!ids.includes(entitlements.premiumCategory)) {
        ids.push(entitlements.premiumCategory);
      }
    }
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
  const [priceSource, setPriceSource] = useState<CardsMetaPriceSource | null>(
    null,
  );
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [setStats, setSetStats] = useState<SetStats | null>(null);

  const reloadSets = useCallback(async () => {
    if (!catalogLive) {
      setSets([]);
      setSetsLoading(false);
      setSetsError(null);
      return;
    }
    setSetsLoading(true);
    setSetsError(null);
    try {
      const { res, body } = await fetchJsonWithRetry<{
        data?: PokemonSet[];
        error?: string;
      }>(`/api/sets?category=${encodeURIComponent(categoryId)}`);
      if (!res.ok) throw new Error(body.error || "Failed to load sets.");
      const list = (body.data as PokemonSet[]) || [];
      setSets(list);
      setSetId((prev) => prev || pickDefaultSetId(list));
    } catch (e) {
      setSetsError(e instanceof Error ? e.message : "Failed to load sets.");
    } finally {
      setSetsLoading(false);
    }
  }, [catalogLive, categoryId]);

  // Load sets for the selected live catalog
  useEffect(() => {

    if (!catalogLive) {
      setSets([]);
      setSetsLoading(false);
      setSetsError(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setSetsLoading(true);
      setSetsError(null);
      setSets([]);
      try {
        const { res, body } = await fetchJsonWithRetry<{
          data?: PokemonSet[];
          error?: string;
        }>(`/api/sets?category=${encodeURIComponent(categoryId)}`);
        if (!res.ok) throw new Error(body.error || "Failed to load sets.");
        if (cancelled) return;
        const list = (body.data as PokemonSet[]) || [];
        setSets(list);
        setSetId((prev) => prev || pickDefaultSetId(list));
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
  }, [catalogLive, categoryId]);

  const loadCards = useCallback(
    async (
      id: string,
      cat: CategoryId,
      releaseDate?: string | null,
      setName?: string | null,
    ) => {
      if (!id || !isLiveCategory(cat)) {
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
        qs.set("category", cat);
        if (releaseDate) qs.set("releaseDate", releaseDate);
        if (setName) qs.set("setName", setName);
        const q = qs.toString();
        const { res, body } = await fetchJsonWithRetry<{
          data?: CardWithPrice[];
          meta?: {
            pricedCount?: number;
            priceSource?: CardsMetaPriceSource;
            fallbackUsed?: boolean;
            stats?: SetStats;
          };
          error?: string;
        }>(`/api/sets/${encodeURIComponent(id)}/cards?${q}`);
        if (!res.ok) throw new Error(body.error || "Failed to load cards.");
        setCards((body.data as CardWithPrice[]) || []);
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
    },
    [],
  );

  const selectedSet = sets.find((s) => s.id === setId);

  useEffect(() => {
    if (!catalogLive) {
      setCards([]);
      setPricedCount(0);
      setPriceSource(null);
      setFallbackUsed(false);
      setSetStats(null);
      setCardsError(null);
      setCardsLoading(false);
      return;
    }
    void loadCards(
      setId,
      categoryId,
      selectedSet?.releaseDate ?? null,
      selectedSet?.name ?? null,
    );
  }, [
    catalogLive,
    categoryId,
    setId,
    selectedSet?.releaseDate,
    selectedSet?.name,
    loadCards,
  ]);

  const handleCategoryChange = useCallback((id: CategoryId) => {
    setCategoryId(id);
    setSetId("");
    setMode("chase");
    setCards([]);
    setPricedCount(0);
    setPriceSource(null);
    setFallbackUsed(false);
    setSetStats(null);
    setCardsError(null);
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
    catalogLive && !fullAccessHere && mode === "chase" && lockedChaseCount > 0;
  const showEntireSetPaywall =
    catalogLive && !fullAccessHere && mode === "all";

  const displayed = fullAccessHere
    ? mode === "chase"
      ? chaseCards
      : allSorted
    : mode === "chase"
      ? freeChaseVisible
      : [];

  const showTcgdexNote =
    isPokemon &&
    (fallbackUsed || priceSource === "tcgdex" || priceSource === "mixed");

  const showOnePiecePriceNote =
    isOnePiece &&
    (priceSource === "optcg" || priceSource === "optcgapi");

  const unlockActions: GateAction[] = useMemo(() => {
    const actions: GateAction[] = [];
    if (!isPremium) {
      actions.push({
        label: `Premium · ${PREMIUM_PRICE_LABEL}`,
        onClick: () => unlockPremium(categoryId),
        accent: "amber",
        checkoutKey: "premium",
        needsPremiumPicker: true,
      });
    } else if (!fullAccessHere) {
      // Premium owned but this live category still top-3 → offer add-on
      actions.push({
        label: `${category.shortLabel} add-on · ${category.priceLabel ?? ADDON_PRICE_LABEL}`,
        onClick: () => unlockAddon(categoryId),
        accent: "sky",
        checkoutKey: categoryId as
          | "pokemon"
          | "one-piece"
          | "mtg"
          | "sports",
      });
    }
    if (!entitlements.allAccess) {
      actions.push({
        label: `All Access · ${ALL_ACCESS_PRICE_LABEL}`,
        onClick: unlockAllAccess,
        accent: "violet",
        checkoutKey: "all_access",
      });
    }
    if (actions.length === 0) {
      actions.push({
        label: `Premium · ${PREMIUM_PRICE_LABEL}`,
        onClick: () => unlockPremium(categoryId),
        accent: "amber",
        checkoutKey: "premium",
        needsPremiumPicker: true,
      });
    }
    return actions;
  }, [
    isPremium,
    fullAccessHere,
    category.shortLabel,
    category.priceLabel,
    categoryId,
    entitlements.allAccess,
    unlockPremium,
    unlockAddon,
    unlockAllAccess,
  ]);

  const unlockMessage = (() => {
    if (!isPremium) {
      return `Free shows top ${FREE_CHASE_LIMIT} chase on every live catalog. Unlock Premium (${PREMIUM_PRICE_LABEL}) and choose one category for full chase + entire set. Other live categories stay top 3 until an add-on (${ADDON_PRICE_LABEL}) or All Access (${ALL_ACCESS_PRICE_LABEL}).`;
    }
    if (isPremium && !fullAccessHere) {
      const picked = entitlements.premiumCategory
        ? getCategory(entitlements.premiumCategory).shortLabel
        : "another category";
      return `Premium unlocked ${picked}. Unlock the ${category.shortLabel} add-on (${category.priceLabel ?? ADDON_PRICE_LABEL}) or All Access for full chase + entire set here.`;
    }
    return `Full ${category.shortLabel} access needs Premium (choose this category), the ${category.shortLabel} add-on, or All Access.`;
  })();

  const chaseSubtitle = (() => {
    if (!catalogLive || !setId || cardsLoading || cardsError) return null;
    if (fullAccessHere) {
      return mode === "chase"
        ? ` · showing top ${chaseCards.length} (≤20%, rounded up)`
        : " · sorted by set number";
    }
    if (mode === "chase") {
      const shown = Math.min(FREE_CHASE_LIMIT, chaseCards.length);
      return ` · Top ${shown} chase (free) · ${chaseCards.length} chase total`;
    }
    return " · Full access required";
  })();

  const setPickerLabel = isPokemon
    ? "Pokémon TCG Set"
    : isOnePiece
      ? "One Piece English Set"
      : `${category.shortLabel} Set`;

  const loadingSetsMessage = isPokemon
    ? "Fetching set list from the Pokémon TCG API."
    : isOnePiece
      ? "Fetching One Piece English sets."
      : `Fetching ${category.label} sets.`;

  const loadingCardsMessage = isPokemon
    ? "Fetching cards and market prices (Pokémon TCG API, with TCGdex fallback if needed)."
    : isOnePiece
      ? "Fetching One Piece cards and USD market prices."
      : `Fetching ${category.label} cards.`;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-3 py-5 sm:gap-8 sm:px-6 sm:py-8 lg:px-8">
      <header className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300/80">
            {catalogLive
              ? `${category.label} · Market chase`
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
              ) : pickingPremiumHeader ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {LIVE_CATALOG_IDS.map((id) => (
                    <button
                      key={id}
                      type="button"
                      disabled={checkoutBusy}
                      onClick={() => void buyPremiumFor(id)}
                      className="min-h-11 rounded-full bg-amber-400 px-3 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 disabled:opacity-60 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px]"
                    >
                      {getCategory(id).shortLabel}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setPickingPremiumHeader(false)}
                    className="text-[11px] text-slate-400 underline-offset-2 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPickingPremiumHeader(true)}
                  disabled={checkoutBusy}
                  className="min-h-11 rounded-full bg-amber-400 px-4 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 disabled:opacity-60 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px]"
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
          <strong className="font-semibold text-amber-200">Pokémon</strong> and{" "}
          <strong className="font-semibold text-amber-200">
            One Piece English
          </strong>{" "}
          are live — free shows the{" "}
          <strong className="font-semibold text-amber-200">top 3 chase</strong>{" "}
          in every live category. Premium ({PREMIUM_PRICE_LABEL}): choose{" "}
          <strong className="font-semibold text-amber-200">one</strong> category
          for full chase + entire set; other live categories stay top 3 until an
          add-on ({"$2.99"}) or All Access ({"$29.99"}). MTG and Sports remain
          coming-soon.
        </p>
      </header>

      {checkoutBanner ? (
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/30 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-100"
          role="status"
        >
          <span>{checkoutBusy ? "Confirming payment…" : checkoutBanner}</span>
          <button
            type="button"
            className="text-xs text-emerald-200/80 underline-offset-2 hover:underline"
            onClick={() => setCheckoutBanner(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <section className="sticky top-0 z-20 space-y-4 rounded-2xl border border-white/10 bg-slate-950/95 p-4 pt-[calc(1rem+env(safe-area-inset-top))] shadow-lg shadow-black/20 backdrop-blur-md sm:p-5 sm:pt-[calc(1.25rem+env(safe-area-inset-top))]">
        <CategorySwitcher
          value={categoryId}
          onChange={handleCategoryChange}
          ownedIds={ownedIds}
          disabled={catalogLive && cardsLoading}
        />

        {catalogLive ? (
          setsLoading ? (
            <StatusPanel
              variant="loading"
              title="Loading sets…"
              message={loadingSetsMessage}
            />
          ) : setsError ? (
            <StatusPanel
              variant="error"
              title="Couldn’t load sets"
              message={setsError}
              onRetry={() => void reloadSets()}
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
                label={setPickerLabel}
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

      {/* Coming-soon categories: entitlement CTAs only */}
      {!catalogLive ? (
        <section className="space-y-4">
          <ComingSoonCategoryPanel
            categoryId={categoryId}
            hint={categoryHint}
            ownsThis={ownsThis}
            hasPremium={isPremium}
            onUnlockAddon={() => unlockAddon(categoryId)}
            onUnlockAllAccess={unlockAllAccess}
            onUnlockPremium={unlockPremium}
          />
          <EntitlementShop
            entitlements={entitlements}
            onUnlockPremium={unlockPremium}
            onUnlockAddon={unlockAddon}
            onUnlockSport={unlockSport}
            onUnlockAllAccess={unlockAllAccess}
            onRestoreFree={restoreFree}
            highlightAddon={!ownsThis ? categoryId : null}
          />
        </section>
      ) : null}

      {catalogLive && !setsLoading && !setsError ? (
        <section className="space-y-4">
          {!setId ? (
            <StatusPanel
              variant="empty"
              title="Choose a set to begin"
              message={`Select a ${category.label} set above to load cards and market prices.`}
            />
          ) : cardsLoading ? (
            <StatusPanel
              variant="loading"
              title={`Loading ${selectedSet?.name ?? "set"}…`}
              message={loadingCardsMessage}
            />
          ) : cardsError ? (
            <StatusPanel
              variant="error"
              title="Couldn’t load cards"
              message={cardsError}
              onRetry={() =>
                void loadCards(
                  setId,
                  categoryId,
                  selectedSet?.releaseDate ?? null,
                  selectedSet?.name ?? null,
                )
              }
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
                    isPokemon && fallbackUsed
                      ? `This set has ${cards.length} card${cards.length === 1 ? "" : "s"}, but neither the Pokémon TCG API nor TCGdex returned a usable TCGPlayer market price. Switch to Entire set to browse them, or try another set.`
                      : `This set has ${cards.length} card${cards.length === 1 ? "" : "s"}, but none have a usable market price. Switch to Entire set to browse them, or try another set.`
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
                      {totalInSet} cards in set · full access unlocks grid
                    </p>
                  </div>
                  <PremiumGate
                    variant="panel"
                    title={`${totalInSet} cards in this set`}
                    message={unlockMessage}
                    onUnlock={unlockPremium}
                    actions={unlockActions}
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
                  {showOnePiecePriceNote ? (
                    <p className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100/90">
                      {priceSource === "optcg"
                        ? "Prices via OPTCG API (USD)"
                        : "Prices via optcgapi.com (market_price USD) · OPTCG key optional for primary host"}
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
                        message={unlockMessage}
                        onUnlock={unlockPremium}
                        actions={unlockActions}
                      />
                    </div>
                  ) : null}
                </>
              )}
            </>
          )}
        </section>
      ) : null}

      {catalogLive && entitlementsReady ? (
        <EntitlementShop
          entitlements={entitlements}
          onUnlockPremium={unlockPremium}
          onUnlockAddon={unlockAddon}
          onUnlockSport={unlockSport}
          onUnlockAllAccess={unlockAllAccess}
          onRestoreFree={restoreFree}
          compact
          highlightAddon={
            catalogLive && !fullAccessHere ? categoryId : null
          }
        />
      ) : null}

      <footer className="border-t border-white/5 pt-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center text-xs text-slate-500">
        Pokémon data © The Pokémon Company International · One Piece English via{" "}
        <a
          className="text-amber-300/80 underline-offset-2 hover:underline"
          href="https://optcg-api.arjunbansal-ai.workers.dev"
          target="_blank"
          rel="noreferrer"
        >
          OPTCG API
        </a>{" "}
        /{" "}
        <a
          className="text-amber-300/80 underline-offset-2 hover:underline"
          href="https://optcgapi.com"
          target="_blank"
          rel="noreferrer"
        >
          optcgapi.com
        </a>
        . Market prices never invented. Not affiliated with Bandai, Nintendo, or
        TPC.
        {entitlementsReady ? (
          <>
            {" "}
            · Free: top {FREE_CHASE_LIMIT} chase on every live catalog ·
            Premium {PREMIUM_PRICE_LABEL} (choose one category) · Add-ons $2.99
            · All Access $29.99 · Stripe when configured.
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
  onUnlockAddon: _onUnlockAddon,
  onUnlockAllAccess: _onUnlockAllAccess,
  onUnlockPremium,
}: {
  categoryId: CategoryId;
  hint: "live" | "entitled_coming_soon" | "locked_coming_soon";
  ownsThis: boolean;
  hasPremium: boolean;
  onUnlockAddon: () => void;
  onUnlockAllAccess: () => void;
  onUnlockPremium: (categoryId: CategoryId) => void;
}) {
  const cat = getCategory(categoryId);
  const [busy, setBusy] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const buyPremium = async (liveId: CategoryId) => {
    setBusy(`premium:${liveId}`);
    try {
      await purchaseEntitlement("premium", {
        premiumCategory: liveId,
        onDemoFallback: () => onUnlockPremium(liveId),
      });
      setPicking(false);
    } finally {
      setBusy(null);
    }
  };

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
          and One Piece remain available.
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
        ($29.99) via the shop to reserve entitlement for when the catalog goes
        live.
        {hasPremium
          ? " Premium already unlocked one live category; add-ons cover the rest."
          : " Premium ($4.99) lets you choose one live category for full depth today."}
      </p>
      {!hasPremium ? (
        <div className="flex w-full flex-col items-stretch gap-2 pt-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {picking ? (
            <>
              {LIVE_CATALOG_IDS.map((id) => (
                <button
                  key={id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void buyPremium(id)}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 shadow hover:bg-amber-300 disabled:opacity-60"
                >
                  {busy === `premium:${id}`
                    ? "Working…"
                    : `${getCategory(id).shortLabel} · ${PREMIUM_PRICE_LABEL}`}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setPicking(false)}
                className="text-[11px] text-slate-400 underline-offset-2 hover:underline"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => setPicking(true)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 shadow hover:bg-amber-300 disabled:opacity-60"
            >
              Premium · {PREMIUM_PRICE_LABEL}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}
