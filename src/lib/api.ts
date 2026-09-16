import type { PokemonCard, PokemonSet } from "./types";

const API_BASE = "https://api.pokemontcg.io/v2";
const MAX_RETRIES = 3;

export class PokemonTcgApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "PokemonTcgApiError";
    this.status = status;
  }
}

function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/json",
  };
  const key = process.env.POKEMONTCG_API_KEY;
  if (key) {
    headers["X-Api-Key"] = key;
  }
  return headers;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function apiFetch<T>(
  path: string,
  searchParams?: Record<string, string>
): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  if (searchParams) {
    for (const [k, v] of Object.entries(searchParams)) {
      url.searchParams.set(k, v);
    }
  }

  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(url.toString(), {
      headers: getHeaders(),
      // Avoid Next.js Data Cache pinning a transient upstream failure
      cache: "no-store",
    });

    lastStatus = res.status;
    lastBody = await res.text();

    if (res.status === 429) {
      throw new PokemonTcgApiError(
        "Rate limited by the Pokémon TCG API. Set POKEMONTCG_API_KEY for higher limits, or try again shortly.",
        429
      );
    }

    if (res.ok) {
      try {
        return JSON.parse(lastBody) as T;
      } catch {
        throw new PokemonTcgApiError(
          "Pokémon TCG API returned invalid JSON.",
          502
        );
      }
    }

    // Retry transient upstream errors
    if ((res.status >= 500 || res.status === 408) && attempt < MAX_RETRIES) {
      await sleep(400 * attempt);
      continue;
    }

    break;
  }

  throw new PokemonTcgApiError(
    `Pokémon TCG API error (${lastStatus}). Prices and card data could not be loaded.`,
    lastStatus || 502
  );
}

type Paginated<T> = {
  data: T[];
  page: number;
  pageSize: number;
  count: number;
  totalCount: number;
};

export async function fetchAllSets(): Promise<PokemonSet[]> {
  const pageSize = 250;
  let page = 1;
  const all: PokemonSet[] = [];

  for (;;) {
    const result = await apiFetch<Paginated<PokemonSet>>("/sets", {
      page: String(page),
      pageSize: String(pageSize),
      orderBy: "-releaseDate",
    });
    all.push(...result.data);
    if (all.length >= result.totalCount || result.data.length === 0) break;
    page += 1;
  }

  // Defensive sort (newest first) in case orderBy is ignored
  all.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return all;
}

export async function fetchCardsBySet(setId: string): Promise<PokemonCard[]> {
  const pageSize = 250;
  let page = 1;
  const all: PokemonCard[] = [];

  for (;;) {
    const result = await apiFetch<Paginated<PokemonCard>>("/cards", {
      q: `set.id:${setId}`,
      page: String(page),
      pageSize: String(pageSize),
    });
    all.push(...result.data);
    if (all.length >= result.totalCount || result.data.length === 0) break;
    page += 1;
  }

  return all;
}
