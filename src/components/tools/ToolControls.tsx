"use client";

import { getCategory, isCategoryId, type CategoryId } from "@/lib/catalog/types";
import { TOOL_CATEGORY_IDS } from "@/lib/tools/categories";
import { ESTIMATE_LABEL } from "@/lib/tools/boxEv";
import type { PokemonSet } from "@/lib/types";

const selectClass =
  "w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

export function CategoryPicker<T extends string>({
  value,
  onChange,
  ids,
}: {
  value: T;
  onChange: (id: T) => void;
  ids?: readonly T[];
}) {
  const choices = ids ?? (TOOL_CATEGORY_IDS as readonly string[] as readonly T[]);
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
        Game
      </span>
      <select
        className={selectClass}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {choices.map((id) => (
          <option key={id} value={id}>
            {isCategoryId(id) ? getCategory(id as CategoryId).label : id}
          </option>
        ))}
      </select>
    </label>
  );
}

export function SetPicker({
  sets,
  value,
  onChange,
  disabled,
}: {
  sets: PokemonSet[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-w-0 flex-[1.4] flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
        Set
      </span>
      <select
        className={selectClass}
        value={value}
        disabled={disabled || sets.length === 0}
        onChange={(event) => onChange(event.target.value)}
      >
        {sets.length === 0 ? <option value="">Loading sets…</option> : null}
        {sets.map((set) => (
          <option key={set.id} value={set.id}>
            {set.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function EstimateTag() {
  return (
    <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
      {ESTIMATE_LABEL}
    </span>
  );
}

export function FanDisclaimer({ category }: { category: string }) {
  if (!isCategoryId(category)) return null;
  const note = getCategory(category).disclaimer;
  if (!note) return null;
  return (
    <p className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs leading-relaxed text-slate-300">
      {note}
    </p>
  );
}

export function VerdictBadge({ verdict }: { verdict: string }) {
  const tone =
    verdict === "Good buy" || verdict === "Worth grading" || verdict === "Hot"
      ? "bg-emerald-400/15 text-emerald-200 border-emerald-300/30"
      : verdict === "Overpriced" || verdict === "Sell raw" || verdict === "Quiet"
        ? "bg-rose-400/10 text-rose-100 border-rose-300/30"
        : "bg-amber-400/15 text-amber-100 border-amber-300/30";
  return (
    <p className={`inline-flex rounded-full border px-3 py-1 text-sm font-bold ${tone}`}>
      {verdict}
    </p>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  step = "0.01",
  estimate = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  step?: string;
  estimate?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-300">
        {label}
        {estimate ? <EstimateTag /> : null}
      </span>
      <input
        type="number"
        inputMode="decimal"
        step={step}
        min="0"
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const next = event.target.value === "" ? 0 : Number(event.target.value);
          onChange(Number.isFinite(next) ? next : 0);
        }}
        className="w-full rounded-lg border border-white/15 bg-slate-950 px-2.5 py-2 text-sm text-white"
      />
    </label>
  );
}
