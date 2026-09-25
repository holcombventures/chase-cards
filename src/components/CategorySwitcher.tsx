"use client";

import {
  CATEGORIES,
  type CategoryId,
} from "@/lib/catalog/types";

type Props = {
  value: CategoryId;
  onChange: (id: CategoryId) => void;
  /** Category ids the user owns (for badge); pokemon always owned for browse */
  ownedIds?: CategoryId[];
  disabled?: boolean;
};

export function CategorySwitcher({
  value,
  onChange,
  ownedIds = ["pokemon"],
  disabled,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">
        Category
      </span>
      <div
        className="flex flex-wrap gap-1.5 rounded-xl border border-white/10 bg-slate-900/60 p-1.5"
        role="tablist"
        aria-label="Card category"
      >
        {CATEGORIES.map((cat) => {
          const selected = value === cat.id;
          const owned = ownedIds.includes(cat.id) || cat.id === "pokemon";
          const comingSoon = cat.status === "coming_soon";
          return (
            <button
              key={cat.id}
              type="button"
              role="tab"
              aria-selected={selected}
              disabled={disabled}
              onClick={() => onChange(cat.id)}
              className={[
                "relative min-h-11 flex-1 rounded-lg px-2.5 py-2.5 text-left transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50 sm:min-h-0 sm:flex-none sm:px-3 sm:py-2",
                selected
                  ? "bg-amber-400 text-slate-950 shadow"
                  : "bg-transparent text-slate-200 hover:bg-white/5",
              ].join(" ")}
              title={
                comingSoon
                  ? owned
                    ? `${cat.label} — entitled · catalog coming soon`
                    : `${cat.label} — coming soon`
                  : cat.free
                    ? `${cat.label} — free catalog`
                    : cat.label
              }
            >
              <span className="block text-xs font-semibold sm:text-sm">
                {cat.shortLabel}
              </span>
              {comingSoon ? (
                <span
                  className={[
                    "mt-0.5 block text-[10px] font-medium uppercase tracking-wide",
                    selected ? "text-slate-800/80" : "text-slate-400",
                  ].join(" ")}
                >
                  {owned ? "Entitled · soon" : "Coming soon"}
                </span>
              ) : cat.free ? (
                <span
                  className={[
                    "mt-0.5 block text-[10px] font-medium uppercase tracking-wide",
                    selected ? "text-slate-800/80" : "text-emerald-400/80",
                  ].join(" ")}
                >
                  Free
                </span>
              ) : (
                <span
                  className={[
                    "mt-0.5 block text-[10px] font-medium uppercase tracking-wide",
                    selected ? "text-slate-800/80" : "text-emerald-400/80",
                  ].join(" ")}
                >
                  Live
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
