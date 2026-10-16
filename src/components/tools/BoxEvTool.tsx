"use client";

import { useEffect, useState } from "react";
import { formatPrice, formatPricesAsOf } from "@/lib/prices";
import {
  ACCESSORIES_NOT_VALUED,
  BOX_EV_SOURCES,
  ESTIMATED_RATES_LABEL,
  EV_NOT_APPLICABLE,
  boxEvVerdict,
  boxPriceRatio,
  classifyCard,
  cloneBoxDefaults,
  exactPriceSource,
  modelBoxEv,
  slotsForRate,
  type RaritySlot,
} from "@/lib/tools/boxEv";
import type { ToolCategoryId } from "@/lib/tools/categories";
import {
  offerChoiceLabel,
  pickDefaultOffer,
  productResultTitle,
  promoMarketFromCards,
  type SealedOffer,
} from "@/lib/tools/sealedProducts";
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

const selectClass =
  "w-full rounded-xl border border-white/15 bg-slate-950 px-3 py-2.5 text-sm text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300";

export function BoxEvTool() {
  const catalog = useToolCatalog();

  return (
    <BoxEvForm
      key={`${catalog.category}:${catalog.setId}`}
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

type ProductEdit = {
  price?: number;
  packs?: number;
  multiplier?: number;
  promo?: boolean;
};

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
  const sealed = useSealedOffers({ category, setId, setName, cardsReady: !loading });
  const [productId, setProductId] = useState<number | null>(null);
  const [edits, setEdits] = useState<Record<number, ProductEdit>>({});
  const [slotsByRate, setSlotsByRate] = useState<Record<string, RaritySlot[]>>({});

  const selected =
    sealed.choices.find((offer) => offer.productId === productId) ??
    pickDefaultOffer(sealed.choices, { category, id: setId, name: setName });
  const edit = selected ? edits[selected.productId] : undefined;
  const unitPrice = edit?.price ?? selected?.marketPrice ?? defaults.boxPrice;
  const packs = edit?.packs ?? selected?.packs ?? defaults.packsPerBox;
  const multiplier = Math.max(1, Math.round(edit?.multiplier ?? 1));
  const promoOn = edit?.promo ?? false;
  const rateTable = selected?.rateTable ?? "standard";
  const slots = slotsByRate[rateTable] ?? slotsForRate(category, rateTable);
  const totalPacks = Math.max(0, packs) * multiplier;
  const comparedPrice = Math.max(0, unitPrice) * multiplier;
  const bonusHits = (selected?.bonus ?? []).map((hit) => ({
    slotId: hit.slotId,
    hits: hit.hits * multiplier,
  }));
  const evApplies = selected ? selected.evApplies : true;

  const model = modelBoxEv({
    cards,
    slots,
    packsPerBox: evApplies ? totalPacks : 0,
    bonusHits: evApplies ? bonusHits : [],
    classify: (card) => classifyCard(category, card),
  });
  const verdict = evApplies
    ? boxEvVerdict(comparedPrice, model.modeledEv, model.pricedCards)
    : "Not applicable";
  const ratio = evApplies ? boxPriceRatio(comparedPrice, model.modeledEv) : null;
  const promoPrice =
    promoOn && selected?.promo ? promoMarketFromCards(cards, selected.name) : null;
  const asOf = formatPricesAsOf(pricesAsOf);
  const title = selected
    ? productResultTitle(setName, selected, packs, multiplier)
    : setName || "Sealed product";
  const hasExactPrice = typeof selected?.marketPrice === "number";
  const sharePath =
    setId && selected && (evApplies ? model.pricedCards > 0 : true)
      ? boxEvSharePath({
          category,
          setId,
          setName,
          releaseDate,
          boxPrice: unitPrice,
          packsPerBox: packs,
          slots,
          productName: selected.name,
          typeLabel: selected.typeLabel,
          multiplier,
          notApplicable: !evApplies,
          rateTable,
          bonus: selected.bonus,
        })
      : "";

  function patchEdit(partial: ProductEdit) {
    if (!selected) return;
    setEdits((current) => ({
      ...current,
      [selected.productId]: { ...current[selected.productId], ...partial },
    }));
  }

  function updateSlot(id: string, hitsPerPack: number) {
    setSlotsByRate((current) => {
      const base = current[rateTable] ?? slotsForRate(category, rateTable);
      return {
        ...current,
        [rateTable]: base.map((slot) => (slot.id === id ? { ...slot, hitsPerPack } : slot)),
      };
    });
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight text-white">Box EV calculator</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-slate-300">
          Pick the sealed product, then see pack EV from live card prices. Pack count, the case
          multiplier, and pull rates are estimates you can edit. This is not buying advice.
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
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-200/80">
            Sealed product
          </span>
          <select
            aria-label="Sealed product"
            className={selectClass}
            value={selected ? String(selected.productId) : ""}
            disabled={sealed.status !== "ready" || sealed.choices.length === 0}
            onChange={(event) => setProductId(Number(event.target.value))}
          >
            {sealed.status !== "ready" ? <option value="">Looking up sealed products…</option> : null}
            {sealed.status === "ready" && sealed.choices.length === 0 ? (
              <option value="">No sealed product found</option>
            ) : null}
            {sealed.choices.map((offer) => (
              <option key={offer.productId} value={offer.productId}>
                {offerChoiceLabel(offer, sealed.choices)}
                {typeof offer.marketPrice === "number" ? ` · ${formatPrice(offer.marketPrice)}` : ""}
              </option>
            ))}
          </select>
        </label>

        {sealed.status === "loading" ? (
          <p className="text-sm text-slate-400">Looking up sealed products…</p>
        ) : (
          <>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold text-white">{title}</h2>
              <p className="text-sm text-slate-300">
                {hasExactPrice
                  ? exactPriceSource(multiplier)
                  : "No TCGplayer sealed market was found for a product in this set, so the price is a placeholder estimate."}
              </p>
              <p className="inline-flex rounded-full border border-amber-300/30 bg-amber-400/15 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-100">
                {ESTIMATED_RATES_LABEL}
              </p>
            </div>

            {evApplies ? (
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-slate-400">Pack EV</p>
                  <p className="text-3xl font-bold text-white">{formatPrice(model.modeledEv)}</p>
                  {asOf ? <p className="text-xs text-slate-400">{asOf}</p> : null}
                </div>
                <VerdictBadge verdict={verdict} />
              </div>
            ) : (
              <p className="text-sm font-medium text-amber-100">{EV_NOT_APPLICABLE}</p>
            )}

            {evApplies ? (
              <p className="text-sm text-slate-300">
                {ratio === null
                  ? "Need priced cards and a pack count before this can call a verdict."
                  : `The product price is ${Math.round(ratio * 100)}% of pack EV. Good buy at 85% or less, fair through 110%, overpriced above that. Promo value is not included.`}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <NumberField
                label="Product price (USD)"
                value={unitPrice}
                onChange={(value) => patchEdit({ price: value })}
                estimate
              />
              <NumberField
                label="Packs in this product"
                value={packs}
                onChange={(value) => patchEdit({ packs: value })}
                step="1"
                estimate
              />
              <NumberField
                label="Case multiplier (×N boxes)"
                value={multiplier}
                onChange={(value) => patchEdit({ multiplier: Math.max(1, Math.round(value || 1)) })}
                step="1"
                estimate
              />
            </div>
            {multiplier > 1 ? (
              <p className="text-xs text-slate-400">
                Compared price {formatPrice(comparedPrice)} for {multiplier} of this product (
                {totalPacks} packs).
              </p>
            ) : selected?.caseCount ? (
              <p className="text-xs text-slate-400">
                Case estimate: ×{selected.caseCount} of this product. Case sizes are not verified, so the multiplier starts at 1.
              </p>
            ) : null}
            {selected?.accessories ? (
              <p className="text-sm text-slate-300">{ACCESSORIES_NOT_VALUED}</p>
            ) : null}
            {selected?.note && evApplies ? (
              <p className="text-sm text-slate-300">{selected.note}</p>
            ) : null}
            {selected?.promo ? (
              <label className="flex items-start gap-2 text-sm text-slate-200">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={promoOn}
                  onChange={(event) => patchEdit({ promo: event.target.checked })}
                />
                <span>Add the promo&apos;s TCGplayer market price. Off by default, and not part of the verdict.</span>
              </label>
            ) : null}
            {promoOn ? (
              <p className="text-sm text-slate-300">
                {promoPrice === null
                  ? "Promo price unknown. Counted as $0 and left out of the verdict."
                  : `Promo add-on ${formatPrice(promoPrice)}. Left out of the verdict.`}
              </p>
            ) : null}
            {sealed.omittedFixed > 0 ? (
              <p className="text-sm text-slate-300">
                {sealed.omittedFixed} fixed or mixed {sealed.omittedFixed === 1 ? "product is" : "products are"} left
                out of this list. {EV_NOT_APPLICABLE}.
              </p>
            ) : null}
            {sharePath ? (
              <ShareButtons path={sharePath} filename={`${category}-${setId}-box-ev`} />
            ) : null}
            <FanDisclaimer category={category} />
          </>
        )}
      </section>

      {evApplies && sealed.status === "ready" ? (
        <div className="overflow-x-auto rounded-2xl border border-white/10">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Rarity</th>
                <th className="px-3 py-2 font-medium">Cards</th>
                <th className="px-3 py-2 font-medium">Typical price</th>
                <th className="px-3 py-2 font-medium">
                  Hits / pack <EstimateTag />
                </th>
                <th className="px-3 py-2 font-medium">Hits in this purchase</th>
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
                    {row.typicalPrice === null ? "No price yet" : formatPrice(row.typicalPrice)}
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
      ) : null}

      <section className="space-y-2 text-sm leading-relaxed text-slate-300">
        <h2 className="text-base font-semibold text-white">Assumptions</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            The selector lists sealed products TCGCSV has for this set. Each option is one SKU, priced from that SKU&apos;s TCGplayer market. Pack EV is packs times the per-pack rates.
          </li>
          <li>
            Pokémon special sets such as 151, Paldean Fates, Crown Zenith, Prismatic Evolutions, Ascended Heroes, and 30th Celebration do not offer a booster box here. They start on a booster bundle or an ETB.
          </li>
          <li>
            A case is the ×N multiplier, not its own product. Reported case sizes are estimates and stay at ×1 until you change the multiplier. The verdict uses pack EV only. A promo is an optional add-on, off by default. Accessories and fixed decks count as $0.
          </li>
          <li>
            Gift boxes, mixed collections, Proving Grounds, event bundles, anniversary sets, and tins whose pack list is not known are left out when a pack product exists. {EV_NOT_APPLICABLE}. Japanese and Chinese products are excluded.
          </li>
          <li>
            Pull rates start from public pack notes and opening write-ups. They are still estimates. Premium Booster and Gundam Edition Beta use their own unconfirmed tables.
          </li>
          <li>Each slot&apos;s typical price is the median of cards with a market price. Cards with no market price are left out.</li>
          <li>{BOX_EV_SOURCES[category]}</li>
          <li>Good buy if the product price is 85% or less of pack EV. Fair up to 110%. Overpriced above 110%.</li>
        </ul>
      </section>
    </div>
  );
}

type SealedListState = {
  status: "loading" | "ready";
  choices: SealedOffer[];
  omittedFixed: number;
};

function readOffer(value: unknown): SealedOffer | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.productId !== "number" || typeof row.name !== "string") return null;
  const bonus = Array.isArray(row.bonus)
    ? row.bonus.flatMap((hit) => {
        if (!hit || typeof hit !== "object") return [];
        const slotId = (hit as { slotId?: unknown }).slotId;
        const hits = (hit as { hits?: unknown }).hits;
        if (typeof slotId !== "string" || typeof hits !== "number") return [];
        return [{ slotId, hits }];
      })
    : [];
  return {
    productId: row.productId,
    name: row.name,
    typeId: typeof row.typeId === "string" ? row.typeId : "fixed",
    typeLabel: typeof row.typeLabel === "string" ? row.typeLabel : "Sealed product",
    marketPrice: typeof row.marketPrice === "number" ? row.marketPrice : null,
    packs: typeof row.packs === "number" ? row.packs : 0,
    cardsPerPack: typeof row.cardsPerPack === "number" ? row.cardsPerPack : null,
    evApplies: row.evApplies === true,
    accessories: row.accessories === true,
    promo: row.promo === true,
    rateTable: typeof row.rateTable === "string" ? row.rateTable : "standard",
    bonus,
    caseCount: typeof row.caseCount === "number" && row.caseCount > 1 ? row.caseCount : null,
    note: typeof row.note === "string" ? row.note : null,
  };
}

function useSealedOffers(input: {
  category: ToolCategoryId;
  setId: string;
  setName: string;
  cardsReady: boolean;
}): SealedListState {
  const [fetched, setFetched] = useState<SealedListState | null>(null);

  useEffect(() => {
    if (!input.setId || !input.cardsReady) return;
    const controller = new AbortController();
    const params = new URLSearchParams({ category: input.category, setId: input.setId });
    if (input.setName) params.set("setName", input.setName);
    fetch(`/api/tools/sealed-box?${params}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json()) as { choices?: unknown; omittedFixed?: unknown };
        if (!res.ok) throw new Error("sealed");
        return body;
      })
      .then((body) => {
        if (controller.signal.aborted) return;
        const choices = Array.isArray(body.choices)
          ? body.choices.flatMap((item) => {
              const offer = readOffer(item);
              return offer ? [offer] : [];
            })
          : [];
        setFetched({
          status: "ready",
          choices,
          omittedFixed: typeof body.omittedFixed === "number" ? body.omittedFixed : 0,
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setFetched({ status: "ready", choices: [], omittedFixed: 0 });
      });
    return () => controller.abort();
  }, [input.cardsReady, input.category, input.setId, input.setName]);

  if (!input.setId || !input.cardsReady || !fetched) {
    return { status: "loading", choices: [], omittedFixed: 0 };
  }
  return fetched;
}
