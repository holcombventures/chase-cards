"use client";

import type { ViewMode } from "@/lib/types";

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  chaseCount?: number | null;
  totalCount?: number | null;
  disabled?: boolean;
  /** Free users: Entire set is gated — still clickable to show paywall */
  entireSetLocked?: boolean;
};

export function ViewToggle({
  mode,
  onChange,
  chaseCount,
  totalCount,
  disabled,
  entireSetLocked = false,
}: Props) {
  const base =
    "flex min-h-11 flex-1 items-center justify-center rounded-lg px-3 py-3 text-base font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60 disabled:opacity-50 sm:text-sm";
  const active = "bg-amber-400 text-slate-950 shadow";
  const idle = "bg-transparent text-slate-200 hover:bg-white/5";

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">
        View
      </span>
      <div className="inline-flex gap-1 rounded-xl border border-white/10 bg-slate-900/60 p-1">
        <button
          type="button"
          disabled={disabled}
          className={`${base} ${mode === "chase" ? active : idle}`}
          onClick={() => onChange("chase")}
        >
          Chase cards
          {typeof chaseCount === "number" ? (
            <span className="ml-1.5 opacity-80">({chaseCount})</span>
          ) : null}
        </button>
        <button
          type="button"
          disabled={disabled}
          className={`${base} ${mode === "all" ? active : idle}`}
          onClick={() => onChange("all")}
          title={entireSetLocked ? "Premium unlocks entire set" : undefined}
        >
          Entire set
          {entireSetLocked ? (
            <span className="ml-1.5 inline-block align-middle opacity-80" aria-hidden>
              🔒
            </span>
          ) : null}
          {typeof totalCount === "number" ? (
            <span className="ml-1.5 opacity-80">({totalCount})</span>
          ) : null}
        </button>
      </div>
    </div>
  );
}
