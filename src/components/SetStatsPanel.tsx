"use client";

import type { SetStatMetric, SetStats } from "@/lib/types";

type Props = {
  stats: SetStats;
  setName?: string | null;
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
    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 sm:px-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <div className="flex flex-wrap items-baseline gap-2">
        <p className={`text-xl font-bold tracking-tight sm:text-2xl ${valueColor}`}>
          {metric.value}
        </p>
        {!isNa ? <TrendGlyph direction={metric.direction} /> : null}
      </div>
      {isNa && metric.naReason ? (
        <p className="text-xs text-slate-400">{metric.naReason}</p>
      ) : null}
      {metric.note ? (
        <p className="text-[11px] text-slate-500">{metric.note}</p>
      ) : null}
      <p className="mt-auto pt-1 text-[10px] leading-snug text-amber-200/70">
        {metric.source}
      </p>
    </div>
  );
}

export function SetStatsPanel({ stats, setName }: Props) {
  return (
    <section
      className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 sm:p-4"
      aria-label={setName ? `Set statistics for ${setName}` : "Set statistics"}
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-amber-100">
          Set statistics
          {setName ? (
            <span className="ml-2 font-normal text-slate-400">· {setName}</span>
          ) : null}
        </h3>
        <p className="text-[11px] text-slate-500">
          Free + Premium · sources labeled on every metric
        </p>
      </div>
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
        <MetricCard label="Total set value" metric={stats.totalSetValue} />
        <MetricCard label="Month-over-month" metric={stats.mom} />
        <MetricCard label="Year-over-year" metric={stats.yoy} />
      </div>
    </section>
  );
}
