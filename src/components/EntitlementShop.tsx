"use client";

import { useCallback, useState } from "react";
import {
  ADDON_CATEGORY_IDS,
  getCategory,
  type CategoryId,
} from "@/lib/catalog/types";
import {
  ADDON_PRICE_LABEL,
  ALL_ACCESS_PRICE_LABEL,
  PREMIUM_PRICE_LABEL,
  type EntitlementsState,
  type SportAddonId,
} from "@/lib/entitlements";
import type { CheckoutEntitlementKey } from "@/lib/stripe/catalog";
import { purchaseEntitlement } from "@/lib/stripe/checkoutClient";

/**
 * One Piece English is live — show category add-ons + All Access needed for
 * OP full depth. Sport add-ons stay hidden (Sports catalog still coming soon).
 */
export const SHOW_ADDON_PURCHASES = true;
export const SHOW_SPORT_ADDON_PURCHASES = false;

type Props = {
  entitlements: EntitlementsState;
  onUnlockPremium: () => void;
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
  const [busy, setBusy] = useState<CheckoutEntitlementKey | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [stripeMode, setStripeMode] = useState<boolean | null>(null);

  const buy = useCallback(
    async (key: CheckoutEntitlementKey, demo: () => void) => {
      setBusy(key);
      setStatus(null);
      try {
        await purchaseEntitlement(key, {
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

  const modeHint =
    stripeMode === true
      ? "Stripe Checkout"
      : stripeMode === false
        ? "Demo unlock · Stripe not configured"
        : "Pays with Stripe when configured · demo unlock otherwise";

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
        <ShopCard
          title="Premium"
          price={PREMIUM_PRICE_LABEL}
          description="Full chase (top 20%) + entire set in owned categories. Pokémon included; One Piece also needs its add-on (or All Access)."
          owned={entitlements.premium || entitlements.allAccess}
          ownedLabel={entitlements.allAccess ? "Included in All Access" : "Owned"}
          busy={busy === "premium"}
          onClick={() => void buy("premium", onUnlockPremium)}
          accent="amber"
        />

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

            {ADDON_CATEGORY_IDS.map((id) => {
              const cat = getCategory(id);
              // Prefer live add-ons; still list coming-soon so MTG/Sports can be reserved.
              const owned =
                entitlements.allAccess ||
                entitlements.categories.includes(id) ||
                (id === "sports" && entitlements.sports.length > 0);
              const isHighlight = highlightAddon === id;
              const key = id as CheckoutEntitlementKey;
              return (
                <ShopCard
                  key={id}
                  title={`${cat.shortLabel} add-on`}
                  price={cat.priceLabel ?? ADDON_PRICE_LABEL}
                  description={
                    cat.status === "coming_soon"
                      ? `Unlocks ${cat.label} when the catalog goes live. Adapter not live yet.`
                      : `With Premium (or All Access): full ${cat.label} chase + entire set. Free users already get top 3 chase.`
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
          go live. Pokémon Premium is available today.
        </p>
      ) : !SHOW_SPORT_ADDON_PURCHASES ? (
        <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
          Per-sport add-ons stay hidden until Sports adapters ship. One Piece
          freemium: free top 3 chase; full depth needs Premium + One Piece
          add-on, or All Access.
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
