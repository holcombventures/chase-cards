"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPrice, formatPricesAsOf } from "@/lib/prices";
import {
  CHECKLIST_OPTIONS,
  CHECKLIST_TRAITS,
  DEFAULT_CHECKLIST,
  DEFAULT_GRADE_MULTIPLIERS,
  DEFAULT_GRADING_FEE,
  DEFAULT_GRADING_SHIPPING,
  GRADING_FEE_PRESETS,
  gradingRoi,
  type ChecklistScores,
  type ChecklistTrait,
  type GradeMultipliers,
} from "@/lib/tools/gradingRoi";
import { gradingSharePath } from "@/lib/tools/shareLinks";
import { ShareButtons } from "./ShareButtons";
import {
  CategoryPicker,
  EstimateTag,
  FanDisclaimer,
  NumberField,
  SetPicker,
  VerdictBadge,
} from "./ToolControls";
import { useToolCatalog } from "./useToolCatalog";

const TRAIT_LABEL: Record<ChecklistTrait, string> = {
  centering: "Centering",
  corners: "Corners",
  edges: "Edges",
  surface: "Surface",
};

export function GradingTool() {
  const catalog = useToolCatalog();
  const [query, setQuery] = useState("");
  const [pickedId, setPickedId] = useState("");
  const [multipliers, setMultipliers] = useState<GradeMultipliers>({ ...DEFAULT_GRADE_MULTIPLIERS });
  const [scores, setScores] = useState<ChecklistScores>({ ...DEFAULT_CHECKLIST });
  const [fee, setFee] = useState(DEFAULT_GRADING_FEE);
  const [shipping, setShipping] = useState(DEFAULT_GRADING_SHIPPING);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const priced = useMemo(
    () =>
      catalog.cards
        .filter((card) => card.marketPrice !== null)
        .sort((a, b) => (b.marketPrice as number) - (a.marketPrice as number)),
    [catalog.cards],
  );
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return priced.slice(0, 80);
    return priced.filter((card) => card.name.toLowerCase().includes(needle)).slice(0, 80);
  }, [priced, query]);

  const card = visible.find((item) => item.id === pickedId) ?? visible[0] ?? null;
  const result =
    card && card.marketPrice !== null
      ? gradingRoi({
          rawPrice: card.marketPrice,
          scores,
          multipliers,
          fee,
          shipping,
        })
      : null;
  const asOf = formatPricesAsOf(catalog.meta?.pricesAsOf);
  const sharePath =
    catalog.selected && card && result
      ? gradingSharePath({
          category: catalog.category,
          setId: catalog.selected.id,
          setName: catalog.selected.name,
          releaseDate: catalog.selected.releaseDate,
          cardId: card.id,
          multipliers,
          scores,
          fee,
          shipping,
        })
      : "";

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Grading ROI checker</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          The raw price is live. Graded values are that price times multipliers you can edit.
          The likely grade is the lowest checklist score. This is an estimate, not grading advice.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <CategoryPicker value={catalog.category} onChange={catalog.setCategory} />
        <SetPicker
          sets={catalog.sets}
          value={catalog.setId}
          onChange={catalog.setSetId}
          disabled={catalog.loading && catalog.sets.length === 0}
        />
      </div>

      {catalog.error ? (
        <p className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {catalog.error}
        </p>
      ) : null}
      {catalog.loading ? <p className="text-sm text-slate-400">Loading live prices…</p> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
            Find a card
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name"
            className="rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
            Card
          </span>
          <select
            value={card?.id ?? ""}
            onChange={(event) => setPickedId(event.target.value)}
            className="rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm"
          >
            {visible.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {formatPrice(item.marketPrice)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {card && result ? (
        <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">{card.name}</h2>
              <p className="text-sm text-slate-300">
                Live raw {formatPrice(card.marketPrice)}
                {card.rarity ? ` · ${card.rarity}` : ""}
              </p>
              {asOf ? <p className="text-xs text-slate-400">{asOf}</p> : null}
            </div>
            <VerdictBadge verdict={result.verdict} />
          </div>
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Likely grade</dt>
              <dd className="text-lg font-semibold text-white">{result.likelyGrade}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Estimated slab</dt>
              <dd className="text-lg font-semibold text-white">{formatPrice(result.slabValue)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Profit after costs</dt>
              <dd className="text-lg font-semibold text-white">{formatPrice(result.profit)}</dd>
            </div>
          </dl>
          <p className="text-sm text-slate-300">
            Worth grading when the slab beats raw by at least $25 and profit is at least 40% of
            fees plus shipping. Costs here are {formatPrice(result.costs)}.
          </p>
          {sharePath ? (
            <ShareButtons path={sharePath} filename={`${catalog.category}-${card.id}-grading`} />
          ) : null}
          <FanDisclaimer category={catalog.category} />
        </section>
      ) : !catalog.loading ? (
        <p className="text-sm text-slate-400">No priced card in this set yet.</p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-2xl border border-white/10 p-4">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-white">
            Condition checklist
          </h2>
          <p className="text-xs text-slate-400">The lowest score wins.</p>
          {CHECKLIST_TRAITS.map((trait) => (
            <label key={trait} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-300">{TRAIT_LABEL[trait]}</span>
              <select
                value={scores[trait]}
                onChange={(event) =>
                  setScores((current) => ({ ...current, [trait]: Number(event.target.value) }))
                }
                className="rounded-lg border border-white/15 bg-slate-950 px-2.5 py-2 text-sm"
              >
                {CHECKLIST_OPTIONS[trait].map((option) => (
                  <option key={option.score} value={option.score}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>

        <div className="space-y-3 rounded-2xl border border-white/10 p-4">
          <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-white">
            Multipliers and costs <EstimateTag />
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              label="PSA 10 × raw"
              value={multipliers[10]}
              estimate
              onChange={(value) => setMultipliers((current) => ({ ...current, 10: value }))}
            />
            <NumberField
              label="PSA 9 × raw"
              value={multipliers[9]}
              estimate
              onChange={(value) => setMultipliers((current) => ({ ...current, 9: value }))}
            />
            <NumberField
              label="PSA 8 × raw"
              value={multipliers[8]}
              estimate
              onChange={(value) => setMultipliers((current) => ({ ...current, 8: value }))}
            />
            <NumberField
              label="Below 8 × raw"
              value={multipliers.below}
              estimate
              onChange={(value) => setMultipliers((current) => ({ ...current, below: value }))}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {GRADING_FEE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => setFee(preset.fee)}
                className="rounded-full border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-amber-300/50"
              >
                {preset.label} ${preset.fee}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Grading fee" value={fee} estimate onChange={setFee} />
            <NumberField label="Shipping" value={shipping} estimate onChange={setShipping} />
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-300">Reference photo</span>
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPhotoUrl((current) => {
                  if (current) URL.revokeObjectURL(current);
                  return file ? URL.createObjectURL(file) : null;
                });
              }}
              className="text-xs text-slate-300"
            />
            <span className="text-xs text-slate-400">
              For your eyes only. The photo stays on this device and is never uploaded.
            </span>
          </label>
          {photoUrl ? (
            // blob: preview only — next/image cannot load an object URL, and this file is not sent anywhere.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photoUrl} alt="Your card, kept on this device" className="max-h-64 rounded-xl" />
          ) : null}
        </div>
      </section>
    </div>
  );
}
