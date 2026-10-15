/**
 * Grading ROI from a live raw price and editable estimates.
 * The likely grade is the lowest checklist score. This is not grading advice.
 */

export const WORTH_GRADING_MIN_UPLIFT = 25;
export const WORTH_GRADING_MIN_PROFIT_RATIO = 0.4;

export const ESTIMATE_LABEL = "estimate, edit me";

export type GradeMultiplierKey = 10 | 9 | 8 | "below";

export type GradeMultipliers = Record<GradeMultiplierKey, number>;

export const DEFAULT_GRADE_MULTIPLIERS: GradeMultipliers = {
  10: 3,
  9: 1.4,
  8: 1.05,
  below: 0.8,
};

export const GRADING_FEE_PRESETS = [
  { id: "value", label: "Value", fee: 25 },
  { id: "regular", label: "Regular", fee: 75 },
  { id: "express", label: "Express", fee: 150 },
] as const;

export const DEFAULT_GRADING_FEE = 25;
export const DEFAULT_GRADING_SHIPPING = 18;

export type ChecklistTrait = "centering" | "corners" | "edges" | "surface";

export type ChecklistScores = Record<ChecklistTrait, number>;

export const CHECKLIST_TRAITS: readonly ChecklistTrait[] = [
  "centering",
  "corners",
  "edges",
  "surface",
];

export const DEFAULT_CHECKLIST: ChecklistScores = {
  centering: 10,
  corners: 10,
  edges: 10,
  surface: 10,
};

export type ChecklistOption = { score: number; label: string };

export const CHECKLIST_OPTIONS: Record<ChecklistTrait, readonly ChecklistOption[]> = {
  centering: [
    { score: 10, label: "10 — even on both axes" },
    { score: 9, label: "9 — slightly heavy one side" },
    { score: 8, label: "8 — clearly off, still in the frame" },
    { score: 6, label: "6 — touches or breaks the border" },
  ],
  corners: [
    { score: 10, label: "10 — sharp, no whitening" },
    { score: 9, label: "9 — a speck of whitening" },
    { score: 8, label: "8 — whitening you can see at arm's length" },
    { score: 6, label: "6 — soft, bent, or dinged" },
  ],
  edges: [
    { score: 10, label: "10 — clean edges" },
    { score: 9, label: "9 — a faint nick" },
    { score: 8, label: "8 — visible chipping" },
    { score: 6, label: "6 — peeling or a crease reaching the edge" },
  ],
  surface: [
    { score: 10, label: "10 — no scratches or print lines" },
    { score: 9, label: "9 — a hairline only in the light" },
    { score: 8, label: "8 — a scratch or print line you notice" },
    { score: 6, label: "6 — crease, dent, or stain" },
  ],
};

export type GradingVerdict = "Worth grading" | "Sell raw";

export type GradingResult = {
  likelyGrade: number;
  pricedGrade: GradeMultiplierKey;
  multiplier: number;
  slabValue: number;
  uplift: number;
  costs: number;
  profit: number;
  verdict: GradingVerdict;
};

/** Lowest trait score wins. A single weak corner keeps the card out of a higher grade. */
export function lowestChecklistScore(scores: ChecklistScores): number {
  return Math.min(scores.centering, scores.corners, scores.edges, scores.surface);
}

export function pricedGradeForScore(score: number): GradeMultiplierKey {
  if (score >= 10) return 10;
  if (score >= 9) return 9;
  if (score >= 8) return 8;
  return "below";
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Worth grading when the expected slab beats selling raw by at least $25
 * and profit is at least 40% of grading fees plus shipping.
 * Profit is slab minus raw minus those costs.
 */
export function gradingRoi(input: {
  rawPrice: number;
  scores: ChecklistScores;
  multipliers: GradeMultipliers;
  fee: number;
  shipping: number;
}): GradingResult | null {
  if (!Number.isFinite(input.rawPrice) || input.rawPrice < 0) return null;
  const likelyGrade = lowestChecklistScore(input.scores);
  if (!Number.isFinite(likelyGrade)) return null;
  const pricedGrade = pricedGradeForScore(likelyGrade);
  const multiplier = finiteOr(input.multipliers[pricedGrade], 0);
  const slabValue = input.rawPrice * (multiplier > 0 ? multiplier : 0);
  const fee = Math.max(0, finiteOr(input.fee, 0));
  const shipping = Math.max(0, finiteOr(input.shipping, 0));
  const costs = fee + shipping;
  const uplift = slabValue - input.rawPrice;
  const profit = uplift - costs;
  const verdict: GradingVerdict =
    uplift >= WORTH_GRADING_MIN_UPLIFT && profit >= WORTH_GRADING_MIN_PROFIT_RATIO * costs
      ? "Worth grading"
      : "Sell raw";
  return {
    likelyGrade,
    pricedGrade,
    multiplier,
    slabValue,
    uplift,
    costs,
    profit,
    verdict,
  };
}
