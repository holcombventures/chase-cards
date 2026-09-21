import { NextResponse } from "next/server";
import { GET as getCards } from "../route";

type Params = { params: Promise<{ setId: string; part: string }> };

export const dynamic = "force-dynamic";

/**
 * Catalog and prices are separate paths so Netlify's CDN cannot store them
 * under one key. The Next runtime varies only on `__nextDataReq` and `_rsc`,
 * which made `?part=catalog` and `?part=prices` overwrite each other.
 */
export async function GET(request: Request, ctx: Params) {
  const { setId, part } = await ctx.params;
  if (part !== "catalog" && part !== "prices") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  url.searchParams.set("part", part);
  const headers = new Headers(request.headers);
  return getCards(new Request(url.toString(), { method: "GET", headers }), {
    params: Promise.resolve({ setId }),
  });
}
