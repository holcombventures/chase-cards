"use client";

import type { SetStatMetric, SetStats } from "@/lib/types";
import { formatPricesAsOf } from "@/lib/prices";

type Props = {
  stats: SetStats;
  setName?: string | null;
  pricesAsOf?: string | null;
};

function TrendGlyph({ direction }: { direction?: "up" | "down" | "flat" | null }) {
  if (direction === "up") {
    return (
      <span className="inline-flex items-center text-emerald-400" aria-label="up">
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden>
          <path fill="currentColor" d="M6 2 L11 9 H1 Z" />
        </svg>
      </span>
    );
  }
  if (direction === "down") {
    return (
      <span className="inline-flex items-center text-rose-400" aria-label="down">
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5" aria-hidden>
          <path fill="currentColor" d="M6 10 L1 3 H11 Z" />
        </svg>
      </span>
    );
  }
  return null;
}

function MetricCard({
  label,
  metric,
}: {
  label: string;
  metric: SetStatMetric;
}) {
  const isNa = metric.value === "N/A";
  const valueColor = isNa
    ? "text-slate-400"
    : metric.direction === "up"
      ? "text-emerald-300"
      : metric.direction === "down"
        ? "text-rose-300"
        : "text-amber-200";

  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border border-white/10 bg-slate-950/50 px-2.5 py-2 sm:gap-1.5 sm:px-4 sm:py-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 sm:text-[11px]">
        {label}
      </p>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className={`text-lg font-bold tracking-tight sm:text-2xl ${valueColor}`}>
          {metric.value}
        </p>
        {!isNa ? <TrendGlyph direction={metric.direction} /> : null}
      </div>
      {isNa && metric.naReason ? (
        <p className="line-clamp-2 text-[10px] text-slate-400 sm:text-xs">{metric.naReason}</p>
      ) : null}
      {metric.note ? (
        <p className="line-clamp-1 text-[10px] text-slate-500 sm:text-[11px]">{metric.note}</p>
      ) : null}
      <p className="mt-auto line-clamp-1 pt-0.5 text-[9px] leading-snug text-amber-200/70 sm:pt-1 sm:text-[10px]">
        {metric.source}
      </p>
    </div>
  );
}

export function SetStatsPanel({ stats, setName, pricesAsOf }: Props) {
  const pricesAsOfLabel = formatPricesAsOf(pricesAsOf);
  return (
    <section
      className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-2.5 sm:p-4"
      aria-label={setName ? `Set statistics for ${setName}` : "Set statistics"}
    >
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1.5 sm:mb-3 sm:gap-2">
        <h3 className="text-xs font-semibold text-amber-100 sm:text-sm">
          Set statistics
          {setName ? (
            <span className="ml-2 font-normal text-slate-400">· {setName}</span>
          ) : null}
        </h3>
        <p className="hidden text-[11px] text-slate-500 sm:block">
          Free + Premium · sources labeled on every metric
        </p>
      </div>
      {pricesAsOfLabel ? (
        <p className="mb-2 text-[11px] text-slate-400 sm:mb-3">{pricesAsOfLabel}</p>
      ) : null}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <MetricCard label="Total set value" metric={stats.totalSetValue} />
        <MetricCard label="Month-over-month" metric={stats.mom} />
      </div>
    </section>
  );
}
