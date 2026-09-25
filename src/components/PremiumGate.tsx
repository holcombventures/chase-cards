"use client";

import { useState } from "react";
import type { CategoryId } from "@/lib/catalog/types";
import { PAID_LIVE_CATALOG_IDS, getCategory } from "@/lib/catalog/types";
import { PREMIUM_PRICE_LABEL } from "@/hooks/usePremium";
import { purchaseEntitlement } from "@/lib/stripe/checkoutClient";
import type { CheckoutEntitlementKey } from "@/lib/stripe/catalog";

export type GateAction = {
  label: string;
  onClick: () => void;
  /** Visual accent for the button */
  accent?: "amber" | "sky" | "violet";
  /** When set, button runs Stripe Checkout with onClick as demo fallback */
  checkoutKey?: CheckoutEntitlementKey;
  /** When checkoutKey is premium, optional pre-selected live category */
  premiumCategory?: CategoryId;
  /** When true, expand into live-category picker before checkout */
  needsPremiumPicker?: boolean;
};

type Props = {
  /** Short headline, e.g. "19 more chase · 122 in set" */
  title: string;
  /** Supporting copy under the title */
  message: string;
  /** Demo / local unlock fallback when Stripe is not configured */
  onUnlock?: (categoryId: CategoryId) => void;
  /** Optional multi-CTA (Premium + add-on / All Access). Overrides default Premium button. */
  actions?: GateAction[];
  /** Compact strip under free chase tiles vs full-panel entire-set gate */
  variant?: "panel" | "inline";
  /** When chase is estimated / unpriced — avoid market-price CTA copy */
  estimatedChase?: boolean;
};

function accentClass(accent: GateAction["accent"] = "amber") {
  if (accent === "violet") return "bg-violet-400 text-slate-950 hover:bg-violet-300";
  if (accent === "sky") return "bg-sky-400 text-slate-950 hover:bg-sky-300";
  return "bg-amber-400 text-slate-950 hover:bg-amber-300";
}

export function PremiumGate({
  title,
  message,
  onUnlock,
  actions,
  variant = "panel",
  estimatedChase = false,
}: Props) {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const shell =
    variant === "inline"
      ? "relative overflow-hidden rounded-2xl border border-amber-400/25 bg-gradient-to-br from-slate-900/90 via-slate-950 to-amber-950/30 p-5 sm:p-6"
      : "mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl border border-amber-400/25 bg-gradient-to-b from-slate-900/80 to-slate-950/90 px-6 py-10 text-center shadow-lg shadow-amber-950/20";

  const resolvedActions: GateAction[] =
    actions && actions.length > 0
      ? actions
      : [
          {
            label: `Unlock Premium · ${PREMIUM_PRICE_LABEL}`,
            onClick: () => onUnlock?.("pokemon"),
            accent: "amber",
            checkoutKey: "premium",
            needsPremiumPicker: true,
          },
        ];

  const runPremiumWithCategory = async (
    _action: GateAction,
    categoryId: CategoryId,
  ) => {
    const key = `premium:${categoryId}`;
    setBusyKey(key);
    setHint(null);
    try {
      await purchaseEntitlement("premium", {
        premiumCategory: categoryId,
        onDemoFallback: () => {
          onUnlock?.(categoryId);
        },
        onStatus: setHint,
      });
      setPicking(false);
    } finally {
      setBusyKey(null);
    }
  };

  const runAction = async (action: GateAction) => {
    if (
      action.checkoutKey === "premium" &&
      (action.needsPremiumPicker || !action.premiumCategory)
    ) {
      if (action.premiumCategory) {
        await runPremiumWithCategory(action, action.premiumCategory);
        return;
      }
      setPicking(true);
      return;
    }

    const key = action.checkoutKey
      ? action.premiumCategory
        ? `${action.checkoutKey}:${action.premiumCategory}`
        : action.checkoutKey
      : action.label;
    setBusyKey(key);
    setHint(null);
    try {
      if (action.checkoutKey) {
        await purchaseEntitlement(action.checkoutKey, {
          premiumCategory: action.premiumCategory,
          onDemoFallback: action.onClick,
          onStatus: setHint,
        });
      } else {
        action.onClick();
      }
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className={shell} role="region" aria-label="Unlock full access">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-300 ${variant === "panel" ? "" : "mb-1"}`}
        aria-hidden
      >
        <LockIcon />
      </div>
      <h3
        className={`font-semibold text-white ${variant === "panel" ? "text-lg" : "text-base sm:text-lg"}`}
      >
        {title}
      </h3>
      <p
        className={`text-sm text-slate-300 ${variant === "panel" ? "max-w-sm opacity-90" : "max-w-xl opacity-90"}`}
      >
        {message}
      </p>
      <ul className="mt-1 space-y-1 text-left text-xs text-slate-400 sm:text-sm">
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            {estimatedChase
              ? "Full estimated chase list"
              : "Full chase list (top 20% by market price)"}
          </span>
        </li>
        <li className="flex items-start gap-2">
          <CheckIcon />
          <span>
            {estimatedChase
              ? "Full chase + entire set when prices land"
              : "Entire set view for every card"}
          </span>
        </li>
      </ul>

      {picking ? (
        <div className="flex w-full flex-col gap-2 pt-2">
          <p className="text-center text-xs font-medium text-amber-200">
            Choose one category for Premium full unlock:
          </p>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
            {PAID_LIVE_CATALOG_IDS.map((id) => {
              const cat = getCategory(id);
              const key = `premium:${id}`;
              const busy = busyKey === key;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() =>
                    void runPremiumWithCategory(
                      {
                        label: cat.shortLabel,
                        onClick: () => onUnlock?.(id),
                        checkoutKey: "premium",
                        premiumCategory: id,
                      },
                      id,
                    )
                  }
                  className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-60 sm:w-auto sm:text-sm ${accentClass("amber")}`}
                >
                  {busy
                    ? "Working…"
                    : `${cat.shortLabel} · ${PREMIUM_PRICE_LABEL}`}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="text-center text-[11px] text-slate-400 underline-offset-2 hover:underline"
          >
            Cancel
          </button>
          <span className="text-center text-[11px] text-slate-500">
            {hint ?? "Other live categories stay top 3 until add-on or All Access"}
          </span>
        </div>
      ) : (
        <div
          className={`flex w-full flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center ${variant === "panel" ? "sm:justify-center" : ""} pt-2`}
        >
          {resolvedActions.map((action) => {
            const key = action.checkoutKey
              ? action.premiumCategory
                ? `${action.checkoutKey}:${action.premiumCategory}`
                : action.checkoutKey
              : action.label;
            const busy = busyKey === key;
            return (
              <button
                key={action.label}
                type="button"
                onClick={() => void runAction(action)}
                disabled={busyKey !== null}
                className={`inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 py-3 text-base font-bold shadow transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/70 disabled:opacity-60 sm:w-auto sm:text-sm ${accentClass(action.accent)}`}
              >
                {busy ? "Working…" : action.label}
              </button>
            );
          })}
          <span className="text-center text-[11px] text-slate-500 sm:text-left">
            {hint ?? "Stripe when configured · demo unlock otherwise"}
          </span>
        </div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <rect
        x="5"
        y="11"
        width="14"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 shrink-0 text-amber-400"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
