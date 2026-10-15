import { NextResponse } from "next/server";
import { isToolCategoryId } from "@/lib/tools/categories";
import { lookupSealedBoxMarket } from "@/lib/tools/sealedBoxLookup";

export const dynamic = "force-dynamic";

/**
 * TCGplayer sealed booster market from the TCGCSV category feed.
 * Missing or failed lookups return a null price so the calculator can
 * keep its placeholder. This does not change catalog price snapshots.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const category = url.searchParams.get("category") || "";
  const setId = url.searchParams.get("setId") || "";
  const setName = url.searchParams.get("setName");
  if (!isToolCategoryId(category) || !/^[a-zA-Z0-9.-]+$/.test(setId)) {
    return NextResponse.json({ error: "Invalid category or set." }, { status: 400 });
  }

  try {
    const quote = await lookupSealedBoxMarket({ category, setId, setName });
    return NextResponse.json({
      marketPrice: quote?.marketPrice ?? null,
      name: quote?.name ?? null,
      source: quote ? "tcgcsv" : null,
    });
  } catch (err) {
    console.error("sealed box lookup failed:", err);
    return NextResponse.json({ marketPrice: null, name: null, source: null });
  }
}
