export type TcgPlayerPriceVariant = {
  low?: number | null;
  mid?: number | null;
  high?: number | null;
  market?: number | null;
  directLow?: number | null;
};

export type PokemonSet = {
  id: string;
  name: string;
  series: string;
  printedTotal: number;
  total: number;
  releaseDate: string;
  images?: {
    symbol?: string;
    logo?: string;
  };
};

export type PokemonCard = {
  id: string;
  name: string;
  number: string;
  rarity?: string;
  images: {
    small: string;
    large: string;
  };
  set: {
    id: string;
    name: string;
    printedTotal: number;
    total: number;
  };
  tcgplayer?: {
    url?: string;
    updatedAt?: string;
    prices?: Record<string, TcgPlayerPriceVariant>;
  };
};

export type PriceSource = "pokemontcg" | "tcgdex";

export type CardWithPrice = PokemonCard & {
  /** Best usable TCGPlayer market price, or null if none */
  marketPrice: number | null;
  priceVariant: string | null;
  priceUpdatedAt: string | null;
  /** Where the market price came from when present */
  priceSource?: PriceSource | null;
};

export type CardsMetaPriceSource = "pokemontcg" | "tcgdex" | "mixed" | "none";

export type ViewMode = "chase" | "all";

/** One metric in the set stats panel — always includes a visible source line. */
export type SetStatMetric = {
  /** Display value, e.g. "$1,234.56", "+3.2%", or "N/A" */
  value: string;
  /** Numeric percent for MoM when available (for up/down visual) */
  percent?: number | null;
  /** Direction for trend visuals */
  direction?: "up" | "down" | "flat" | null;
  /** Short reason when value is N/A */
  naReason?: string | null;
  /** Always present — shown under the number, including N/A states */
  source: string;
  /** Extra footnote, e.g. "based on 110 of 122 priced cards" */
  note?: string | null;
};

export type SetStats = {
  totalSetValue: SetStatMetric;
  mom: SetStatMetric;
};
