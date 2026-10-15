import { NextResponse } from "next/server";
import { readStoredPriceSnapshot } from "@/lib/priceSnapshotStore";
import { isToolCategoryId } from "@/lib/tools/categories";
import { movementMap, recordSnapshotHistory } from "@/lib/tools/hypeHistory";

export const dynamic = "force-dynamic";

/**
 * Records a price point from the snapshot the catalog route already stored.
 * It does not call TCGCSV, Pokémon, or any other upstream.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "";
  const setId = url.searchParams.get("setId") || "";
  if (!isToolCategoryId(category) || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid category or set." }, { status: 400 });
  }

  const snapshot = await readStoredPriceSnapshot(category, setId);
  if (!snapshot) {
    return NextResponse.json({
      recorded: false,
      pricesAsOf: null,
      points: 0,
      movement: {},
      detail: "Collecting data. Movement appears after two price snapshots.",
    });
  }

  const history = await recordSnapshotHistory(snapshot);
  const latest = history.points[history.points.length - 1];
  return NextResponse.json({
    recorded: true,
    pricesAsOf: snapshot.pricesAsOf,
    points: history.points.length,
    movement: movementMap(history, Object.keys(latest?.prices ?? {})),
    detail:
      history.points.length < 2
        ? "Collecting data. Movement appears after two price snapshots."
        : `Movement from ${history.points.length} snapshots.`,
  });
}
