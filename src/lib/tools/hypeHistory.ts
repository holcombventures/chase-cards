import type { PriceSnapshot } from "@/lib/priceSnapshot";
import {
  mergePriceHistory,
  movementForCard,
  windowMovementForCard,
  SWING_WINDOW_DAYS,
  type PriceMovement,
  type SetPriceHistory,
  type SwingWindow,
  type WindowMovement,
} from "./hypeScore";
import { readToolJson, writeToolJson } from "./toolStore";

function historyKey(category: string, setId: string): string {
  return `set/${category}/${setId}`;
}

export function parseSetPriceHistory(raw: unknown): SetPriceHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<SetPriceHistory>;
  if (value.v !== 1) return null;
  if (typeof value.category !== "string" || typeof value.setId !== "string") return null;
  if (!Array.isArray(value.points)) return null;
  const points = [];
  for (const point of value.points) {
    if (!point || typeof point !== "object") return null;
    const at = (point as { at?: unknown }).at;
    const prices = (point as { prices?: unknown }).prices;
    if (typeof at !== "string" || !at) return null;
    if (!prices || typeof prices !== "object" || Array.isArray(prices)) return null;
    const clean: Record<string, number> = {};
    for (const [id, price] of Object.entries(prices)) {
      if (typeof price === "number" && Number.isFinite(price)) clean[id] = price;
    }
    points.push({ at, prices: clean });
  }
  return { v: 1, category: value.category, setId: value.setId, points };
}

export function historyDay(iso: string): string {
  const day = iso.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day;
  return new Date().toISOString().slice(0, 10);
}

export function pointFromSnapshot(snapshot: PriceSnapshot): { at: string; prices: Record<string, number> } {
  const prices: Record<string, number> = {};
  for (const patch of snapshot.data) {
    if (typeof patch.marketPrice === "number" && Number.isFinite(patch.marketPrice)) {
      prices[patch.id] = patch.marketPrice;
    }
  }
  return { at: historyDay(snapshot.pricesAsOf), prices };
}

export async function recordPricePoint(
  category: string,
  setId: string,
  point: { at: string; prices: Record<string, number> },
): Promise<SetPriceHistory> {
  const key = historyKey(category, setId);
  let existing: SetPriceHistory | null = null;
  try {
    existing = parseSetPriceHistory(await readToolJson(key));
  } catch (err) {
    console.error("hype history read failed:", err);
  }
  const next = mergePriceHistory(existing, point, { category, setId });
  if (next !== existing) {
    try {
      await writeToolJson(key, next);
    } catch (err) {
      console.error("hype history write failed:", err);
    }
  }
  return next;
}

export async function recordSnapshotHistory(snapshot: PriceSnapshot): Promise<SetPriceHistory> {
  return recordPricePoint(snapshot.category, snapshot.setId, pointFromSnapshot(snapshot));
}

export async function readSetHistory(category: string, setId: string): Promise<SetPriceHistory | null> {
  try {
    return parseSetPriceHistory(await readToolJson(historyKey(category, setId)));
  } catch (err) {
    console.error("hype history read failed:", err);
    return null;
  }
}

export function movementMap(
  history: SetPriceHistory | null,
  cardIds: readonly string[],
): Record<string, PriceMovement> {
  const movement: Record<string, PriceMovement> = {};
  for (const cardId of cardIds) {
    movement[cardId] = movementForCard(history, cardId);
  }
  return movement;
}

export function windowMovementMap(
  history: SetPriceHistory | null,
  cardIds: readonly string[],
  windowId: SwingWindow,
  now = Date.now(),
): Record<string, WindowMovement> {
  const movement: Record<string, WindowMovement> = {};
  const days = SWING_WINDOW_DAYS[windowId];
  for (const cardId of cardIds) {
    movement[cardId] = windowMovementForCard(history, cardId, days, now);
  }
  return movement;
}
