import { NextResponse } from "next/server";
import { readStoredPriceSnapshot } from "@/lib/priceSnapshotStore";
import { isHypeCategoryId } from "@/lib/tools/categories";
import { movementMap, recordSnapshotHistory, windowMovementMap } from "@/lib/tools/hypeHistory";

export const dynamic = "force-dynamic";

/**
 * Records a price point from the snapshot the catalog route already stored.
 * It does not call TCGCSV, Pokémon, or any other upstream.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "";
  const setId = url.searchParams.get("setId") || "";
  if (!isHypeCategoryId(category) || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid category or set." }, { status: 400 });
  }

  const snapshot = await readStoredPriceSnapshot(category, setId);
  if (!snapshot) {
    return NextResponse.json({
      recorded: false,
      pricesAsOf: null,
      points: 0,
      movement: {},
      detail: "Price history is still building. Daily snapshots add the next point.",
    });
  }

  const history = await recordSnapshotHistory(snapshot);
  const ids = Object.keys(history.points[history.points.length - 1]?.prices ?? {});
  return NextResponse.json({
    recorded: true,
    pricesAsOf: snapshot.pricesAsOf,
    points: history.points.length,
    movement: movementMap(history, ids),
    windows: {
      "24h": windowMovementMap(history, ids, "24h"),
      "7d": windowMovementMap(history, ids, "7d"),
      "30d": windowMovementMap(history, ids, "30d"),
    },
    detail:
      history.points.length < 2
        ? "Price history is still building. Daily snapshots add the next point."
        : `Price history has ${history.points.length} daily snapshots.`,
  });
}
