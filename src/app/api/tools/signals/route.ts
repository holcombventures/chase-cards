import { NextResponse } from "next/server";
import { isToolCategoryId } from "@/lib/tools/categories";
import { loadHypeSignals } from "@/lib/tools/signals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const category = new URL(request.url).searchParams.get("category") || "";
  if (!isToolCategoryId(category)) {
    return NextResponse.json({ error: "Invalid category." }, { status: 400 });
  }
  try {
    const signals = await loadHypeSignals(category);
    return NextResponse.json(signals, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({
      cached: false,
      tournament: {
        status: "unavailable",
        detail: "Tournament signal failed.",
        gameId: null,
        decklists: 0,
        copies: {},
      },
      buzz: {
        status: "unavailable",
        detail: "Buzz signal failed.",
        subreddit: null,
        posts: [],
      },
    });
  }
}
