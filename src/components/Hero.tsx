"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import type { CardWithPrice } from "@/lib/types";
import { formatPrice, formatPriceLabel } from "@/lib/prices";
import {
  FREE_CHASE_LIMIT,
  PREMIUM_PRICE_LABEL,
  entitlementBadgeLabel,
  type EntitlementsState,
} from "@/lib/entitlements";
import {
  LIVE_CATALOG_IDS,
  getCategory,
  type CategoryId,
} from "@/lib/catalog/types";

const CHASE_SECTION_ID = "chase";
/** Try free lands here — Choose set / toggles / stats frame on mobile */
const SET_CHROME_SECTION_ID = "set-chrome";

type Props = {
  top3: CardWithPrice[];
  loading: boolean;
  /** When true, collage top-3 are estimated (unpriced / new set) */
  estimated?: boolean;
  entitlementsReady: boolean;
  entitlements: EntitlementsState;
  badge: string | null;
  checkoutBusy: boolean;
  pickingPremium: boolean;
  onStartPremiumPick: () => void;
  onCancelPremiumPick: () => void;
  onBuyPremiumFor: (categoryId: CategoryId) => void;
  onRestoreFree: () => void;
  /** Prefer chase-mode set collection (not Statistics) */
  onTryFree?: () => void;
  /** Category tabs rendered under the collage */
  children?: ReactNode;
};

const CHASE_HEADING_ID = "chase-heading";
/** Netlify DP chrome + home indicator — keep heading above this band */
const TRY_FREE_BOTTOM_PAD_PX = 72;

function scrollToTryFreeFrame() {
  if (typeof document === "undefined") return;
  // Pin "Top 3 chase" near the bottom of the viewport so Choose set /
  // toggles / stats stay readable above — not chrome-only, not heading@top.
  const heading = document.getElementById(CHASE_HEADING_ID);
  if (heading) {
    const rect = heading.getBoundingClientRect();
    const absoluteTop = rect.top + window.scrollY;
    const targetY =
      absoluteTop - (window.innerHeight - rect.height - TRY_FREE_BOTTOM_PAD_PX);
    window.scrollTo({ top: Math.max(0, targetY), behavior: "smooth" });
    if (typeof heading.focus === "function") {
      try {
        heading.focus({ preventScroll: true });
      } catch {
        heading.focus();
      }
    }
    return;
  }
  const el =
    document.getElementById(SET_CHROME_SECTION_ID) ||
    document.getElementById(CHASE_SECTION_ID);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function CollageSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={[
            "absolute aspect-[5/7] w-[38%] max-w-[140px] animate-pulse rounded-xl border border-white/10 bg-slate-800/80 shadow-lg shadow-black/40 sm:max-w-[160px] lg:max-w-[180px]",
            i === 0 ? "-translate-x-[70%] -rotate-6" : "",
            i === 1 ? "z-10 -translate-y-2" : "",
            i === 2 ? "translate-x-[70%] rotate-6" : "",
          ].join(" ")}
          aria-hidden
        />
      ))}
    </>
  );
}

function CollageCard({
  card,
  rank,
  offset,
}: {
  card: CardWithPrice;
  rank: number;
  offset: "left" | "center" | "right";
}) {
  const hasPrice = card.marketPrice !== null;
  const offsetClass =
    offset === "left"
      ? "z-[1] -translate-x-[70%] -rotate-6"
      : offset === "right"
        ? "z-[1] translate-x-[70%] rotate-6"
        : "z-20 -translate-y-3";

  return (
    <div
      className={[
        "absolute aspect-[5/7] w-[38%] max-w-[140px] overflow-hidden rounded-xl border border-white/15 bg-slate-900 shadow-xl shadow-black/50 sm:max-w-[160px] lg:max-w-[180px]",
        offsetClass,
      ].join(" ")}
    >
      <div className="relative h-full w-full">
        <Image
          src={card.images.large || card.images.small}
          alt={card.name}
          fill
          sizes="(max-width: 640px) 38vw, 180px"
          className="object-contain p-1.5 pb-8"
          loading="eager"
          decoding="async"
          unoptimized
        />
        <div className="absolute left-1.5 top-1.5 z-10 rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-950 shadow">
          #{rank}
        </div>
        <div
          className={[
            "absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded-md border px-1.5 py-1 text-center backdrop-blur-sm",
            hasPrice
              ? "border-amber-400/30 bg-slate-950/90"
              : "border-white/15 bg-slate-950/90",
          ].join(" ")}
        >
          <p
            className={[
              "truncate text-[10px] font-bold tabular-nums sm:text-xs",
              hasPrice ? "text-amber-300" : "text-slate-300",
            ].join(" ")}
          >
            {hasPrice
              ? formatPrice(card.marketPrice)
              : formatPriceLabel(null)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Hero({
  top3,
  loading,
  estimated = false,
  entitlementsReady,
  entitlements,
  badge,
  checkoutBusy,
  pickingPremium,
  onStartPremiumPick,
  onCancelPremiumPick,
  onBuyPremiumFor,
  onRestoreFree,
  onTryFree,
  children,
}: Props) {
  const handleTryFree = () => {
    onTryFree?.();
    // Defer scroll so chase mode / DOM updates land before scrollIntoView
    requestAnimationFrame(() => {
      requestAnimationFrame(scrollToTryFreeFrame);
    });
  };
  const showCollage = !loading && top3.length > 0;
  const offsets: Array<"left" | "center" | "right"> = ["left", "center", "right"];

  return (
    <header className="space-y-6 sm:space-y-8">
      {/* Nav row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-base font-bold tracking-tight text-white sm:text-lg">
          Chase Cards
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
                  onClick={onRestoreFree}
                  className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
                >
                  Restore free
                </button>
              </>
            ) : pickingPremium ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="sr-only">Choose one live category for Premium</span>
                {LIVE_CATALOG_IDS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={checkoutBusy}
                    onClick={() => onBuyPremiumFor(id)}
                    className="min-h-11 rounded-full bg-amber-400 px-3 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60 sm:min-h-0 sm:px-3 sm:py-1 sm:text-[11px]"
                  >
                    {getCategory(id).shortLabel}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={onCancelPremiumPick}
                  className="text-[11px] text-slate-400 underline-offset-2 hover:underline"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onStartPremiumPick}
                  disabled={checkoutBusy}
                  className="min-h-11 rounded-full bg-amber-400 px-3.5 py-2.5 text-xs font-bold text-slate-950 shadow hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-[11px]"
                  aria-label={`Premium ${PREMIUM_PRICE_LABEL} — choose one category`}
                >
                  Premium {PREMIUM_PRICE_LABEL}
                </button>
                <button
                  type="button"
                  onClick={handleTryFree}
                  className="min-h-11 rounded-full border border-white/15 bg-transparent px-3.5 py-2.5 text-xs font-semibold text-slate-200 hover:border-amber-400/40 hover:bg-white/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-[11px]"
                >
                  Free top {FREE_CHASE_LIMIT}
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      {/* Copy + collage: stacked mobile, side-by-side desktop */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-center lg:gap-10">
        <div className="space-y-4 sm:space-y-5">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
            See the expensive chase before you buy the box.
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-slate-300 sm:text-lg">
            Free unlocks the top 3. Premium opens the full set.
          </p>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={handleTryFree}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-5 py-3 text-sm font-bold text-slate-950 shadow-lg shadow-amber-950/30 hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Try free · Top {FREE_CHASE_LIMIT}
            </button>
            {entitlementsReady && !badge ? (
              pickingPremium ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  {LIVE_CATALOG_IDS.map((id) => (
                    <button
                      key={`cta-${id}`}
                      type="button"
                      disabled={checkoutBusy}
                      onClick={() => onBuyPremiumFor(id)}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-slate-950 shadow hover:bg-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60"
                    >
                      {getCategory(id).shortLabel}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={onCancelPremiumPick}
                    className="text-xs text-slate-400 underline-offset-2 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onStartPremiumPick}
                  disabled={checkoutBusy}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white hover:border-amber-400/40 hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:opacity-60"
                >
                  Go Premium
                </button>
              )
            ) : entitlementsReady && badge ? (
              <p className="text-sm text-amber-200/80">
                {entitlementBadgeLabel(entitlements) ?? badge} active
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2 lg:items-stretch">
          <div
            className="relative mx-auto flex h-48 w-full max-w-md items-end justify-center sm:h-60 sm:max-w-lg lg:mx-0 lg:h-64 lg:max-w-none"
            aria-label={
              showCollage
                ? `Top ${Math.min(FREE_CHASE_LIMIT, top3.length)} chase cards${estimated ? " (estimated)" : ""}`
                : "Chase card collage loading"
            }
          >
            {showCollage ? (
              top3.slice(0, FREE_CHASE_LIMIT).map((card, i) => (
                <CollageCard
                  key={card.id}
                  card={card}
                  rank={i + 1}
                  offset={offsets[i] ?? "center"}
                />
              ))
            ) : (
              <CollageSkeleton />
            )}
          </div>
          {showCollage && estimated ? (
            <p className="text-center text-[11px] font-medium text-sky-200/90">
              Estimated chase · prices coming when market data lands
            </p>
          ) : null}
        </div>
      </div>

      {children ? <div className="pt-1">{children}</div> : null}
    </header>
  );
}

export { CHASE_SECTION_ID, SET_CHROME_SECTION_ID, CHASE_HEADING_ID };
