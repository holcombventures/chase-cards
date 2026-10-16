import { NextResponse } from "next/server";
import { isToolCategoryId } from "@/lib/tools/categories";
import { lookupSealedProducts } from "@/lib/tools/sealedBoxLookup";
import { omittedFixedCount, visibleOffers } from "@/lib/tools/sealedProducts";

export const dynamic = "force-dynamic";

/**
 * Sealed products for one set, priced from the matching TCGCSV SKU.
 * Fixed and mixed products stay in `offers` so the page can explain them.
 * A failed lookup returns an empty list and the calculator keeps a placeholder.
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
    const offers = await lookupSealedProducts({ category, setId, setName });
    return NextResponse.json({
      offers,
      choices: visibleOffers(offers),
      omittedFixed: omittedFixedCount(offers),
      source: offers.length ? "tcgcsv" : null,
    });
  } catch (err) {
    console.error("sealed product lookup failed:", err);
    return NextResponse.json({ offers: [], choices: [], omittedFixed: 0, source: null });
  }
}
