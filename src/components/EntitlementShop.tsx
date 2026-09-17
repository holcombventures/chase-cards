"use client";

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
} from "@/lib/entitlements";

type Props = {
  entitlements: EntitlementsState;
  onUnlockPremium: () => void;
  onUnlockAddon: (id: CategoryId) => void;
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
  onUnlockAllAccess,
  onRestoreFree,
  highlightAddon = null,
  compact = false,
}: Props) {
  const hasAny =
    entitlements.premium ||
    entitlements.allAccess ||
    entitlements.categories.length > 0;

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
        <span className="text-[11px] text-slate-500">
          Demo unlock · no payment
        </span>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Premium */}
        <ShopCard
          title="Premium"
          price={PREMIUM_PRICE_LABEL}
          description="Full chase (top 20%) + entire set in owned categories. Pokémon included."
          owned={entitlements.premium || entitlements.allAccess}
          ownedLabel={entitlements.allAccess ? "Included in All Access" : "Owned"}
          onClick={onUnlockPremium}
          accent="amber"
        />

        {/* All Access */}
        <ShopCard
          title="All Access"
          price={ALL_ACCESS_PRICE_LABEL}
          description="Permanent unlock for all live categories + category add-ons. Best for multi-TCG."
          owned={entitlements.allAccess}
          ownedLabel="Owned"
          onClick={onUnlockAllAccess}
          accent="violet"
          highlight
        />

        {/* Add-ons */}
        {ADDON_CATEGORY_IDS.map((id) => {
          const cat = getCategory(id);
          const owned =
            entitlements.allAccess || entitlements.categories.includes(id);
          const isHighlight = highlightAddon === id;
          return (
            <ShopCard
              key={id}
              title={`${cat.shortLabel} add-on`}
              price={cat.priceLabel ?? ADDON_PRICE_LABEL}
              description={
                cat.status === "coming_soon"
                  ? `Unlocks ${cat.label} when the catalog goes live. Adapter not live yet.`
                  : `Unlocks ${cat.label} chase & set browsing.`
              }
              owned={owned}
              ownedLabel={
                entitlements.allAccess ? "Included in All Access" : "Owned"
              }
              onClick={() => onUnlockAddon(id)}
              accent="sky"
              highlight={isHighlight}
            />
          );
        })}
      </div>

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
}: {
  title: string;
  price: string;
  description: string;
  owned: boolean;
  ownedLabel: string;
  onClick: () => void;
  accent: "amber" | "violet" | "sky";
  highlight?: boolean;
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
          className={`inline-flex min-h-10 items-center justify-center rounded-lg px-3 text-xs font-bold transition ${btn}`}
        >
          Demo unlock · {price}
        </button>
      )}
    </div>
  );
}
