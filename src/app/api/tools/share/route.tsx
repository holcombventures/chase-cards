import { NextResponse } from "next/server";
import { getCategory, isCategoryId } from "@/lib/catalog/types";
import { formatPrice } from "@/lib/prices";
import { readStoredPriceSnapshot } from "@/lib/priceSnapshotStore";
import {
  boxEvVerdict,
  boxPriceRatio,
  classifyCard,
  cloneBoxDefaults,
  modelBoxEv,
  type RaritySlot,
} from "@/lib/tools/boxEv";
import { loadToolCards } from "@/lib/tools/catalogLoad";
import { isToolCategoryId, type ToolCategoryId } from "@/lib/tools/categories";
import {
  DEFAULT_CHECKLIST,
  DEFAULT_GRADE_MULTIPLIERS,
  gradingRoi,
  type ChecklistScores,
  type GradeMultipliers,
} from "@/lib/tools/gradingRoi";
import { recordSnapshotHistory } from "@/lib/tools/hypeHistory";
import {
  buzzPoints,
  countMentions,
  hypeTotal,
  movementForCard,
  normalizeCardName,
  releaseTimingPoints,
  tournamentPoints,
} from "@/lib/tools/hypeScore";
import { loadHypeSignals } from "@/lib/tools/signals";
import { shareFormat, shareImageResponse } from "@/lib/tools/shareImage";
import type { CardWithPrice } from "@/lib/types";

export const dynamic = "force-dynamic";

function numberParam(value: string | null, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function applyHits(slots: RaritySlot[], raw: string | null): RaritySlot[] {
  if (!raw) return slots;
  const overrides = new Map<string, number>();
  for (const part of raw.split(",")) {
    const [id, value] = part.split(":");
    const parsed = Number(value);
    if (!id || !Number.isFinite(parsed)) continue;
    overrides.set(id, Math.min(100, Math.max(0, parsed)));
  }
  return slots.map((slot) =>
    overrides.has(slot.id) ? { ...slot, hitsPerPack: overrides.get(slot.id) as number } : slot,
  );
}

function fanNote(category: string): string | null {
  if (!isCategoryId(category)) return null;
  return getCategory(category).disclaimer ?? null;
}

function topPriced(cards: CardWithPrice[]): CardWithPrice | null {
  let best: CardWithPrice | null = null;
  for (const card of cards) {
    if (card.marketPrice === null) continue;
    if (!best || card.marketPrice > (best.marketPrice as number)) best = card;
  }
  return best;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tool = url.searchParams.get("tool");
  const category = url.searchParams.get("category") || "";
  const setId = url.searchParams.get("setId") || "";
  const format = shareFormat(url.searchParams.get("format"));
  if (!isToolCategoryId(category) || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid category or set." }, { status: 400 });
  }
  if (tool !== "box-ev" && tool !== "grading-roi" && tool !== "hype") {
    return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
  }

  try {
    const loaded = await loadToolCards(category, setId, {
      setName: url.searchParams.get("setName"),
      releaseDate: url.searchParams.get("releaseDate"),
    });
    const setName =
      url.searchParams.get("setName") || loaded.cards[0]?.set?.name || setId;
    const disclaimer = fanNote(category);

    if (tool === "box-ev") {
      const defaults = cloneBoxDefaults(category);
      const packsPerBox = Math.min(128, Math.max(0, numberParam(url.searchParams.get("packs"), defaults.packsPerBox)));
      const boxPrice = Math.max(0, numberParam(url.searchParams.get("boxPrice"), defaults.boxPrice));
      const model = modelBoxEv({
        cards: loaded.cards,
        slots: applyHits(defaults.slots, url.searchParams.get("hits")),
        packsPerBox,
        classify: (card) => classifyCard(category, card),
      });
      const verdict = boxEvVerdict(boxPrice, model.modeledEv, model.pricedCards);
      const ratio = boxPriceRatio(boxPrice, model.modeledEv);
      const chase = topPriced(loaded.cards);
      const image = await shareImageResponse({
        format,
        kicker: "Box EV",
        title: setName,
        subtitle: chase
          ? `${chase.name} · live ${formatPrice(chase.marketPrice)}`
          : "Live card prices",
        priceLabel: "Modeled EV per box",
        price: formatPrice(model.modeledEv),
        verdict,
        note:
          ratio === null
            ? "Estimate, not advice. Pull rates are editable guesses."
            : `Box price ${formatPrice(boxPrice)} is ${Math.round(ratio * 100)}% of modeled EV. Estimate, not advice.`,
        disclaimer,
      });
      return image;
    }

    const cardId = url.searchParams.get("cardId") || "";
    const card = loaded.cards.find((item) => item.id === cardId) ?? null;
    if (!card) {
      return NextResponse.json({ error: "Card not found in this set." }, { status: 404 });
    }
    if (card.marketPrice === null) {
      return NextResponse.json({ error: "This card has no live price yet." }, { status: 404 });
    }

    if (tool === "grading-roi") {
      const multipliers: GradeMultipliers = {
        10: numberParam(url.searchParams.get("m10"), DEFAULT_GRADE_MULTIPLIERS[10]),
        9: numberParam(url.searchParams.get("m9"), DEFAULT_GRADE_MULTIPLIERS[9]),
        8: numberParam(url.searchParams.get("m8"), DEFAULT_GRADE_MULTIPLIERS[8]),
        below: numberParam(url.searchParams.get("mbelow"), DEFAULT_GRADE_MULTIPLIERS.below),
      };
      const scores: ChecklistScores = {
        centering: numberParam(url.searchParams.get("centering"), DEFAULT_CHECKLIST.centering),
        corners: numberParam(url.searchParams.get("corners"), DEFAULT_CHECKLIST.corners),
        edges: numberParam(url.searchParams.get("edges"), DEFAULT_CHECKLIST.edges),
        surface: numberParam(url.searchParams.get("surface"), DEFAULT_CHECKLIST.surface),
      };
      const result = gradingRoi({
        rawPrice: card.marketPrice,
        scores,
        multipliers,
        fee: numberParam(url.searchParams.get("fee"), 25),
        shipping: numberParam(url.searchParams.get("shipping"), 18),
      });
      if (!result) {
        return NextResponse.json({ error: "Could not score this card." }, { status: 400 });
      }
      return shareImageResponse({
        format,
        kicker: "Grading ROI",
        title: card.name,
        subtitle: `${setName} · likely grade ${result.likelyGrade}`,
        priceLabel: "Live raw price",
        price: formatPrice(card.marketPrice),
        verdict: result.verdict,
        note: `Estimated slab ${formatPrice(result.slabValue)}. Estimate, not grading advice.`,
        disclaimer,
      });
    }

    const releaseDate = url.searchParams.get("releaseDate") || loaded.meta.releaseDate || null;
    const signals = await loadHypeSignals(category as ToolCategoryId);
    const snapshot = await readStoredPriceSnapshot(category, setId);
    const history = snapshot ? await recordSnapshotHistory(snapshot) : null;
    const timing = releaseTimingPoints(releaseDate);
    const copies =
      signals.tournament.status === "ok"
        ? signals.tournament.copies[normalizeCardName(card.name)] ?? 0
        : null;
    const mentions =
      signals.buzz.status === "ok" ? countMentions(card.name, signals.buzz.posts) : null;
    const total = hypeTotal({
      timing: timing.status === "ok" ? timing.points : null,
      tournament: copies === null ? null : tournamentPoints(copies),
      buzz: mentions === null ? null : buzzPoints(mentions),
    });
    const movement = movementForCard(history, card.id);
    const movementNote =
      movement.status === "collecting"
        ? "Price movement: collecting data."
        : `Price ${movement.delta >= 0 ? "up" : "down"} ${formatPrice(Math.abs(movement.delta))} across snapshots.`;
    return shareImageResponse({
      format,
      kicker: "Hype tracker",
      title: card.name,
      subtitle: `${setName} · score ${total.total}/${total.max || 0}`,
      priceLabel: "Live market price",
      price: formatPrice(card.marketPrice),
      verdict: total.label,
      note: movementNote,
      disclaimer,
    });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Could not build the share image.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
