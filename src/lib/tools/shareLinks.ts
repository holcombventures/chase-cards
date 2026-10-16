import type { RaritySlot } from "./boxEv";
import type { ChecklistScores, GradeMultipliers } from "./gradingRoi";
type ShareBase = {
  category: string;
  setId: string;
  setName?: string | null;
  releaseDate?: string | null;
  format?: "og" | "ig";
};

function baseParams(input: ShareBase, tool: string): URLSearchParams {
  const params = new URLSearchParams();
  params.set("tool", tool);
  params.set("category", input.category);
  params.set("setId", input.setId);
  params.set("format", input.format ?? "og");
  if (input.setName) params.set("setName", input.setName);
  if (input.releaseDate) params.set("releaseDate", input.releaseDate);
  return params;
}

export function boxEvSharePath(
  input: ShareBase & {
    boxPrice: number;
    packsPerBox: number;
    slots: readonly RaritySlot[];
    productName?: string | null;
    typeLabel?: string | null;
    multiplier?: number;
    notApplicable?: boolean;
    rateTable?: string | null;
    bonus?: readonly { slotId: string; hits: number }[];
  },
): string {
  const params = baseParams(input, "box-ev");
  params.set("boxPrice", String(input.boxPrice));
  params.set("packs", String(input.packsPerBox));
  params.set("hits", input.slots.map((slot) => `${slot.id}:${slot.hitsPerPack}`).join(","));
  if (input.productName) params.set("product", input.productName);
  if (input.typeLabel) params.set("type", input.typeLabel);
  if (input.multiplier && input.multiplier > 1) params.set("multiplier", String(input.multiplier));
  if (input.notApplicable) params.set("na", "1");
  if (input.rateTable && input.rateTable !== "standard") params.set("rate", input.rateTable);
  if (input.bonus?.length) {
    params.set("bonus", input.bonus.map((hit) => `${hit.slotId}:${hit.hits}`).join(","));
  }
  return `/api/tools/share?${params}`;
}

export function gradingSharePath(
  input: ShareBase & {
    cardId: string;
    multipliers: GradeMultipliers;
    scores: ChecklistScores;
    fee: number;
    shipping: number;
  },
): string {
  const params = baseParams(input, "grading-roi");
  params.set("cardId", input.cardId);
  params.set("m10", String(input.multipliers[10]));
  params.set("m9", String(input.multipliers[9]));
  params.set("m8", String(input.multipliers[8]));
  params.set("mbelow", String(input.multipliers.below));
  params.set("centering", String(input.scores.centering));
  params.set("corners", String(input.scores.corners));
  params.set("edges", String(input.scores.edges));
  params.set("surface", String(input.scores.surface));
  params.set("fee", String(input.fee));
  params.set("shipping", String(input.shipping));
  return `/api/tools/share?${params}`;
}

export function hypeSharePath(input: ShareBase & { cardId: string }): string {
  const params = baseParams(input, "hype");
  params.set("cardId", input.cardId);
  return `/api/tools/share?${params}`;
}

export function withShareFormat(path: string, format: "og" | "ig"): string {
  const url = new URL(path, "http://chasecards.local");
  url.searchParams.set("format", format);
  return `${url.pathname}?${url.searchParams}`;
}
