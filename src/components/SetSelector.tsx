"use client";

import type { PokemonSet } from "@/lib/types";

type Props = {
  sets: PokemonSet[];
  value: string;
  onChange: (setId: string) => void;
  disabled?: boolean;
  /** Label above the select, e.g. "Pokémon TCG Set" */
  label?: string;
};

export function SetSelector({
  sets,
  value,
  onChange,
  disabled,
  label = "Set",
}: Props) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/70">
        {label}
      </span>
      <select
        className="min-h-11 w-full rounded-xl border border-white/10 bg-slate-900/80 px-3 py-3 text-base text-white shadow-inner outline-none ring-amber-400/40 focus:ring-2 disabled:opacity-50 sm:text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || sets.length === 0}
      >
        <option value="">Select a set…</option>
        {sets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.series ? ` (${s.series})` : ""}
            {s.releaseDate ? ` — ${s.releaseDate}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
