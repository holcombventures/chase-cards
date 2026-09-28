import { NextResponse } from "next/server";
import { PokemonTcgApiError } from "@/lib/api";
import {
  assertLiveCatalog,
  CatalogNotLiveError,
  hasCatalogAdapter,
  isCategoryId,
  type CategoryId,
} from "@/lib/catalog";
import * as pokemonCatalog from "@/lib/catalog/pokemon";
import * as onePieceCatalog from "@/lib/catalog/one-piece";
import { OnePieceApiError } from "@/lib/catalog/one-piece";
import * as mtgCatalog from "@/lib/catalog/mtg";
import { MtgApiError } from "@/lib/catalog/mtg";
import * as lorcanaCatalog from "@/lib/catalog/lorcana";
import { LorcanaApiError } from "@/lib/catalog/lorcana";

function parseCategory(request: Request): CategoryId {
  const url = new URL(request.url);
  const raw = url.searchParams.get("category") || "pokemon";
  if (!isCategoryId(raw)) {
    throw new Response(JSON.stringify({ error: "Invalid category." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!hasCatalogAdapter(raw)) {
    throw new Response(
      JSON.stringify({
        error: `Catalog for ${raw} is not live yet.`,
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
  return raw;
}

export async function GET(request: Request) {
  let category: CategoryId;
  try {
    category = parseCategory(request);
  } catch (res) {
    if (res instanceof Response) return res;
    throw res;
  }

  try {
    const adapterId = assertLiveCatalog(category);
    const sets =
      adapterId === "one-piece"
        ? await onePieceCatalog.fetchSets()
        : adapterId === "mtg"
          ? await mtgCatalog.fetchSets()
          : adapterId === "lorcana"
            ? await lorcanaCatalog.fetchSets()
            : await pokemonCatalog.fetchSets();
    return NextResponse.json({
      data: sets,
      meta: { category: adapterId },
    });
  } catch (err) {
    if (err instanceof PokemonTcgApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    if (err instanceof OnePieceApiError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status === 429 ? 429 : 502 },
      );
    }
    if (err instanceof MtgApiError || err instanceof LorcanaApiError) {
      return NextResponse.json(
        { error: err.message },
        {
          status:
            err.status === 429 ? 429 : err.status === 404 ? 404 : err.status === 400 ? 400 : 502,
        },
      );
    }
    if (err instanceof CatalogNotLiveError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error loading sets." },
      { status: 500 },
    );
  }
}
