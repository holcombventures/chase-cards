"use client";

import type { PokemonSet } from "@/lib/types";

type Props = {
  sets: PokemonSet[];
  value: string;
  onChange: (setId: string) => void;
  disabled?: boolean;
  /** Label above the select, e.g. "Pokémon TCG Set" */
  label?: string;
  /** Visual weight: prominent under hero vs compact in sticky bar */
  size?: "prominent" | "compact";
};

export function SetSelector({
  sets,
  value,
  onChange,
  disabled,
  label = "Choose set",
  size = "prominent",
}: Props) {
  const selected = sets.find((s) => s.id === value);
  const prominent = size === "prominent";

  return (
    <label
      className={[
        "flex min-w-0 w-full flex-col",
        prominent ? "gap-2" : "gap-1.5 flex-1",
      ].join(" ")}
    >
      <span
        className={[
          "font-semibold uppercase tracking-wider",
          prominent
            ? "text-sm text-amber-200"
            : "text-xs text-amber-200/80",
        ].join(" ")}
      >
        {label}
      </span>
      {prominent && selected ? (
        <span className="truncate text-base font-semibold text-white sm:text-lg">
          {selected.name}
          {selected.series ? (
            <span className="ml-2 text-sm font-normal text-slate-400">
              {selected.series}
            </span>
          ) : null}
        </span>
      ) : null}
      <select
        className={[
          "w-full rounded-xl border bg-slate-900 text-white shadow-inner outline-none ring-amber-400/50 focus:ring-2 disabled:opacity-50",
          "border-white/25 hover:border-amber-400/50",
          // Native select — opens within page, no portal vs Netlify banner
          prominent
            ? "min-h-12 px-4 py-3 text-base font-medium sm:min-h-[3.25rem] sm:text-[15px]"
            : "min-h-11 px-3 py-3 text-base sm:text-sm",
        ].join(" ")}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || sets.length === 0}
        aria-label={label}
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
