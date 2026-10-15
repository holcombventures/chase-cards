"use client";

import { useMemo, useState } from "react";
import { formatPrice, formatPricesAsOf } from "@/lib/prices";
import {
  BOX_EV_SOURCES,
  boxEvVerdict,
  boxPriceRatio,
  classifyCard,
  cloneBoxDefaults,
  modelBoxEv,
  type RaritySlot,
} from "@/lib/tools/boxEv";
import { boxEvSharePath } from "@/lib/tools/shareLinks";
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

export function BoxEvTool() {
  const catalog = useToolCatalog();

  return (
    <BoxEvForm
      key={catalog.category}
      category={catalog.category}
      cards={catalog.cards}
      setId={catalog.selected?.id ?? ""}
      setName={catalog.selected?.name ?? ""}
      releaseDate={catalog.selected?.releaseDate ?? ""}
      pricesAsOf={catalog.meta?.pricesAsOf ?? null}
      loading={catalog.loading}
      error={catalog.error}
      sets={catalog.sets}
      selectedSetId={catalog.setId}
      onCategory={catalog.setCategory}
      onSet={catalog.setSetId}
    />
  );
}

function BoxEvForm({
  category,
  cards,
  setId,
  setName,
  releaseDate,
  pricesAsOf,
  loading,
  error,
  sets,
  selectedSetId,
  onCategory,
  onSet,
}: {
  category: ReturnType<typeof useToolCatalog>["category"];
  cards: ReturnType<typeof useToolCatalog>["cards"];
  setId: string;
  setName: string;
  releaseDate: string;
  pricesAsOf: string | null;
  loading: boolean;
  error: string | null;
  sets: ReturnType<typeof useToolCatalog>["sets"];
  selectedSetId: string;
  onCategory: ReturnType<typeof useToolCatalog>["setCategory"];
  onSet: ReturnType<typeof useToolCatalog>["setSetId"];
}) {
  const defaults = cloneBoxDefaults(category);
  const [boxPrice, setBoxPrice] = useState(defaults.boxPrice);
  const [packsPerBox, setPacksPerBox] = useState(defaults.packsPerBox);
  const [slots, setSlots] = useState<RaritySlot[]>(defaults.slots);

  const model = useMemo(
    () =>
      modelBoxEv({
        cards,
        slots,
        packsPerBox,
        classify: (card) => classifyCard(category, card),
      }),
    [cards, category, packsPerBox, slots],
  );
  const verdict = boxEvVerdict(boxPrice, model.modeledEv, model.pricedCards);
  const ratio = boxPriceRatio(boxPrice, model.modeledEv);
  const asOf = formatPricesAsOf(pricesAsOf);
  const sharePath =
    setId && model.pricedCards > 0
      ? boxEvSharePath({
          category,
          setId,
          setName,
          releaseDate,
          boxPrice,
          packsPerBox,
          slots,
        })
      : "";

  function updateSlot(id: string, hitsPerPack: number) {
    setSlots((current) =>
      current.map((slot) => (slot.id === id ? { ...slot, hitsPerPack } : slot)),
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Box EV calculator</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          Live card prices come from the same catalog as the chase list. Box price, pack count,
          and pull rates are estimates you can edit. This is not buying advice.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row">
        <CategoryPicker value={category} onChange={onCategory} />
        <SetPicker
          sets={sets}
          value={selectedSetId}
          onChange={onSet}
          disabled={loading && sets.length === 0}
        />
      </div>

      {error ? (
        <p className="rounded-xl border border-rose-300/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
          {error}
        </p>
      ) : null}
      {loading ? <p className="text-sm text-slate-400">Loading live prices…</p> : null}

      <section className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-slate-400">Modeled EV</p>
            <p className="text-3xl font-bold text-white">{formatPrice(model.modeledEv)}</p>
            {asOf ? <p className="text-xs text-slate-400">{asOf}</p> : null}
          </div>
          <VerdictBadge verdict={verdict} />
        </div>
        <p className="text-sm text-slate-300">
          {ratio === null
            ? "Need priced cards and a pack count before this can call a verdict."
            : `Your box price is ${Math.round(ratio * 100)}% of modeled EV. Good buy at 85% or less, fair through 110%, overpriced above that.`}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Box price (USD)" value={boxPrice} onChange={setBoxPrice} estimate />
          <NumberField
            label="Packs per box"
            value={packsPerBox}
            onChange={setPacksPerBox}
            step="1"
            estimate
          />
        </div>
        {sharePath ? (
          <ShareButtons path={sharePath} filename={`${category}-${setId}-box-ev`} />
        ) : null}
        <FanDisclaimer category={category} />
      </section>

      <div className="overflow-x-auto rounded-2xl border border-white/10">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
            <tr>
              <th className="px-3 py-2 font-medium">Rarity</th>
              <th className="px-3 py-2 font-medium">Cards</th>
              <th className="px-3 py-2 font-medium">Avg live price</th>
              <th className="px-3 py-2 font-medium">
                Hits / pack <EstimateTag />
              </th>
              <th className="px-3 py-2 font-medium">Hits / box</th>
              <th className="px-3 py-2 font-medium">Slot EV</th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => (
              <tr key={row.id} className="border-t border-white/10">
                <td className="px-3 py-2 text-slate-100">{row.label}</td>
                <td className="px-3 py-2 text-slate-300">
                  {row.pricedCount}/{row.cardCount} priced
                </td>
                <td className="px-3 py-2 text-slate-100">
                  {row.averagePrice === null ? "No price yet" : formatPrice(row.averagePrice)}
                </td>
                <td className="px-3 py-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    aria-label={`${row.label} hits per pack`}
                    value={slots.find((slot) => slot.id === row.id)?.hitsPerPack ?? 0}
                    onChange={(event) =>
                      updateSlot(row.id, event.target.value === "" ? 0 : Number(event.target.value))
                    }
                    className="w-24 rounded-lg border border-white/15 bg-slate-950 px-2 py-1 text-sm"
                  />
                </td>
                <td className="px-3 py-2 text-slate-300">{row.hitsPerBox.toFixed(2)}</td>
                <td className="px-3 py-2 text-slate-100">{formatPrice(row.slotEv)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="space-y-2 text-sm leading-relaxed text-slate-300">
        <h2 className="text-base font-semibold text-white">Assumptions</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Box price, pack count, and pull rates start from public pack notes and opening write-ups. They are still estimates. Edit them.</li>
          <li>Each priced card in a slot is treated as equally likely. Chase printings stay in their own slot, so a signed or iconic card is not averaged into a common rarity. Cards with no market price are left out of that slot&apos;s average.</li>
          <li>{BOX_EV_SOURCES[category]}</li>
          <li>Hits per box = hits per pack × packs per box. Slot EV = average live price × hits per box.</li>
          <li>Modeled EV is the sum of the slot EVs. It is not a promise of what a box opens.</li>
          <li>Good buy if the box price is 85% or less of modeled EV. Fair up to 110%. Overpriced above 110%.</li>
        </ul>
      </section>
    </div>
  );
}
