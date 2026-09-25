"use client";

import { useCallback, useState } from "react";
import {
  ADDON_CATEGORY_IDS,
  PAID_LIVE_CATALOG_IDS,
  getCategory,
  isLiveCategory,
  type CategoryId,
} from "@/lib/catalog/types";
import {
  ADDON_PRICE_LABEL,
  ALL_ACCESS_PRICE_LABEL,
  PREMIUM_PRICE_LABEL,
  hasFullAccessInCategory,
  type EntitlementsState,
  type SportAddonId,
} from "@/lib/entitlements";
import type { CheckoutEntitlementKey } from "@/lib/stripe/catalog";
import { purchaseEntitlement } from "@/lib/stripe/checkoutClient";

/**
 * One Piece English is live — show category add-ons + All Access needed for
 * full depth on non-chosen categories. Sport add-ons stay hidden (Sports still coming soon).
 */
export const SHOW_ADDON_PURCHASES = true;
export const SHOW_SPORT_ADDON_PURCHASES = false;

type Props = {
  entitlements: EntitlementsState;
  onUnlockPremium: (categoryId: CategoryId) => void;
  onUnlockAddon: (id: CategoryId) => void;
  onUnlockSport?: (id: SportAddonId) => void;
  onUnlockAllAccess: () => void;
  onRestoreFree: () => void;
  /** Optional highlight for a specific category add-on CTA */
  highlightAddon?: CategoryId | null;
  compact?: boolean;
};

export function EntitlementShop({
  entitlements,
  onUnlockPremium,
  onUnlockAddon,
  onUnlockSport: _onUnlockSport,
  onUnlockAllAccess,
  onRestoreFree,
  highlightAddon = null,
  compact = false,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [stripeMode, setStripeMode] = useState<boolean | null>(null);
  const [pickingPremium, setPickingPremium] = useState(false);

  const buy = useCallback(
    async (
      key: CheckoutEntitlementKey,
      demo: () => void,
      premiumCategory?: CategoryId,
    ) => {
      setBusy(premiumCategory ? `premium:${premiumCategory}` : key);
      setStatus(null);
      try {
        await purchaseEntitlement(key, {
          premiumCategory,
          onDemoFallback: () => {
            setStripeMode(false);
            demo();
          },
          onStatus: (msg) => {
            if (msg === "Starting checkout…") setStripeMode(true);
            setStatus(msg);
          },
        });
      } finally {
        setBusy(null);
      }
    },
    [],
  );

  const hasAny =
    entitlements.premium ||
    entitlements.allAccess ||
    entitlements.categories.length > 0 ||
    entitlements.sports.length > 0;

  const premiumOwned = entitlements.premium || entitlements.allAccess;
  const premiumCatLabel = entitlements.premiumCategory
    ? getCategory(entitlements.premiumCategory).shortLabel
    : null;

  const modeHint =
    stripeMode === true
      ? "Stripe Checkout"
      : stripeMode === false
        ? "Demo unlock · Stripe not configured"
        : "Pays with Stripe when configured · demo unlock otherwise";

  /** Live add-ons only after Premium (choose-one used); coming-soon always reservable.
   * MTG is the exception: the $1.99 add-on is the unlock, even before Premium.
   */
  const addonIdsToShow: CategoryId[] = (() => {
    const ids: CategoryId[] = [];
    if (
      isLiveCategory("mtg") &&
      !hasFullAccessInCategory(entitlements, "mtg")
    ) {
      ids.push("mtg");
    }
    if (entitlements.premium || entitlements.allAccess) {
      for (const id of PAID_LIVE_CATALOG_IDS) {
        if (!hasFullAccessInCategory(entitlements, id) && !ids.includes(id)) {
          ids.push(id);
        }
      }
    }
    for (const id of ADDON_CATEGORY_IDS) {
      if (!isLiveCategory(id) && !ids.includes(id)) {
        ids.push(id);
      }
    }
    return ids;
  })();

  return (
    <div
      className={[
        "rounded-2xl border border-white/10 bg-slate-900/60",
        compact ? "p-4" : "p-5 sm:p-6",
      ].join(" ")}
      role="region"
      aria-label="Entitlements shop"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white sm:text-base">
          Unlock more chase
        </h3>
        <span className="text-[11px] text-slate-500">{modeHint}</span>
      </div>

      {status ? (
        <p className="mb-3 rounded-lg border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-xs text-amber-100">
          {status}
        </p>
      ) : null}

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        <div
          className={`flex flex-col gap-2 rounded-xl border border-amber-400/25 bg-slate-950/50 p-3.5`}
        >
          <div className="flex items-start justify-between gap-2">
            <h4 className="text-sm font-semibold text-white">Premium</h4>
            <span className="shrink-0 text-sm font-bold text-amber-200">
              {PREMIUM_PRICE_LABEL}
            </span>
          </div>
          <p className="flex-1 text-xs leading-relaxed text-slate-400">
            Choose one category for full chase + entire set. Other live
            categories stay top 3 until you buy an add-on or All Access.
          </p>
          {premiumOwned ? (
            <span className="inline-flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-200">
              <span>
                {entitlements.allAccess
                  ? "Included in All Access"
                  : "Owned"}
              </span>
              {premiumCatLabel && !entitlements.allAccess ? (
                <span className="text-[10px] font-medium text-emerald-200/80">
                  Full unlock · {premiumCatLabel}
                </span>
              ) : null}
            </span>
          ) : pickingPremium ? (
            <div className="flex flex-col gap-2">
              <p className="text-[11px] font-medium text-amber-200/90">
                Choose your Premium category:
              </p>
              <div className="flex flex-col gap-1.5">
                {PAID_LIVE_CATALOG_IDS.map((id) => {
                  const cat = getCategory(id);
                  const key = `premium:${id}`;
                  return (
                    <button
                      key={id}
                      type="button"
                      disabled={busy !== null}
                      onClick={() =>
                        void buy(
                          "premium",
                          () => {
                            onUnlockPremium(id);
                            setPickingPremium(false);
                          },
                          id,
                        )
                      }
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
                    >
                      {busy === key
                        ? "Working…"
                        : `${cat.shortLabel} · ${PREMIUM_PRICE_LABEL}`}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => setPickingPremium(false)}
                className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickingPremium(true)}
              disabled={busy !== null}
              className="inline-flex min-h-10 items-center justify-center rounded-lg bg-amber-400 px-3 text-xs font-bold text-slate-950 transition hover:bg-amber-300 disabled:opacity-60"
            >
              Unlock · {PREMIUM_PRICE_LABEL}
            </button>
          )}
        </div>

        {SHOW_ADDON_PURCHASES ? (
          <>
            <ShopCard
              title="All Access"
              price={ALL_ACCESS_PRICE_LABEL}
              description="Permanent unlock for all live categories + category add-ons. Best for multi-TCG."
              owned={entitlements.allAccess}
              ownedLabel="Owned"
              busy={busy === "all_access"}
              onClick={() => void buy("all_access", onUnlockAllAccess)}
              accent="violet"
              highlight
            />

            {addonIdsToShow.map((id) => {
              const cat = getCategory(id);
              const owned =
                entitlements.allAccess ||
                hasFullAccessInCategory(entitlements, id) ||
                entitlements.categories.includes(id) ||
                entitlements.premiumCategory === id ||
                (id === "sports" && entitlements.sports.length > 0);
              // Don't show owned live add-ons (already filtered), but coming-soon may be owned
              if (owned && isLiveCategory(id)) return null;
              const isHighlight = highlightAddon === id;
              const key = id as CheckoutEntitlementKey;
              const price = cat.priceLabel ?? ADDON_PRICE_LABEL;
              return (
                <ShopCard
                  key={id}
                  title={`${cat.shortLabel} add-on`}
                  price={price}
                  description={
                    cat.status === "coming_soon"
                      ? `Unlocks ${cat.label} when the catalog goes live. Adapter not live yet.`
                      : `With Premium: full ${cat.label} chase + entire set on this category (you already unlocked another with Premium). Free users get top 3 on every live catalog.`
                  }
                  owned={owned}
                  ownedLabel={
                    entitlements.allAccess ? "Included in All Access" : "Owned"
                  }
                  busy={busy === key}
                  onClick={() => void buy(key, () => onUnlockAddon(id))}
                  accent="sky"
                  highlight={isHighlight}
                />
              );
            })}
          </>
        ) : null}
      </div>

      {!SHOW_ADDON_PURCHASES ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Category add-ons (and All Access) will appear here when those catalogs
          go live. Premium lets you choose one live category today.
        </p>
      ) : !SHOW_SPORT_ADDON_PURCHASES ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Per-sport add-ons stay hidden until Sports adapters ship. Free: top 3
          chase on Pokémon, One Piece, and MTG. Disney Lorcana stays free.
          Premium: pick one paid category for full depth; add-ons unlock the
          others.
        </p>
      ) : null}

      {hasAny ? (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onRestoreFree}
            className="text-[11px] text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
          >
            Restore free / clear entitlements
          </button>
        </div>
      ) : null}
    </div>
  );
}

function ShopCard({
  title,
  price,
  description,
  owned,
  ownedLabel,
  onClick,
  accent,
  highlight,
  busy,
}: {
  title: string;
  price: string;
  description: string;
  owned: boolean;
  ownedLabel: string;
  onClick: () => void;
  accent: "amber" | "violet" | "sky";
  highlight?: boolean;
  busy?: boolean;
}) {
  const border =
    accent === "violet"
      ? "border-violet-400/30"
      : accent === "sky"
        ? "border-sky-400/25"
        : "border-amber-400/25";
  const btn =
    accent === "violet"
      ? "bg-violet-400 text-slate-950 hover:bg-violet-300"
      : accent === "sky"
        ? "bg-sky-400 text-slate-950 hover:bg-sky-300"
        : "bg-amber-400 text-slate-950 hover:bg-amber-300";
  const ring = highlight ? "ring-2 ring-amber-400/50" : "";

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border ${border} bg-slate-950/50 p-3.5 ${ring}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <span className="shrink-0 text-sm font-bold text-amber-200">{price}</span>
      </div>
      <p className="flex-1 text-xs leading-relaxed text-slate-400">{description}</p>
      {owned ? (
        <span className="inline-flex min-h-10 items-center justify-center rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 text-xs font-semibold text-emerald-200">
          {ownedLabel}
        </span>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={busy}
          className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-bold transition disabled:opacity-60 ${btn}`}
        >
          {busy ? "Working…" : `Unlock · ${price}`}
        </button>
      )}
    </div>
  );
}
