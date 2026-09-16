import { NextResponse } from "next/server";
import { fetchAllSets, PokemonTcgApiError } from "@/lib/api";

export async function GET() {
  try {
    const sets = await fetchAllSets();
    return NextResponse.json({ data: sets });
  } catch (err) {
    if (err instanceof PokemonTcgApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status === 429 ? 429 : 502 });
    }
    console.error(err);
    return NextResponse.json(
      { error: "Unexpected error loading sets from the Pokémon TCG API." },
      { status: 500 }
    );
  }
}
