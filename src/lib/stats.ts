import type {
  CardWithPrice,
  CardsMetaPriceSource,
  SetStatMetric,
  SetStats,
} from "./types";
import type { TcgdexCardmarketHit, TcgdexSetPriceBundle } from "./tcgdex";
import { flattenCardmarketHits } from "./tcgdex";
import { formatPrice } from "./prices";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** MoM needs ~30 days of set age; slight slack for new releases. */
const MOM_MIN_DAYS = 28;

export function priceSourceLabel(source: CardsMetaPriceSource | null | undefined): string {
  switch (source) {
    case "pokemontcg":
      return "Source: Pokémon TCG API (TCGPlayer)";
    case "tcgdex":
      return "Source: TCGdex (TCGPlayer)";
    case "mixed":
      return "Source: mixed — Pokémon TCG API + TCGdex (TCGPlayer)";
    case "none":
      return "Source: none (no usable TCGPlayer market prices)";
    default:
      return "Source: unknown";
  }
}

const MOM_SOURCE = "Source: TCGdex (Cardmarket, ~30-day avg)";
function parseReleaseDate(raw: string | null | undefined): Date | null {
  if (!raw || !raw.trim()) return null;
  // Accept YYYY/MM/DD (pokemontcg) or YYYY-MM-DD (tcgdex)
  const normalized = raw.trim().replace(/\//g, "-");
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function daysSinceRelease(
  releaseDate: string | null | undefined,
  now: Date = new Date()
): number | null {
  const d = parseReleaseDate(releaseDate);
  if (!d) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today - d.getTime()) / MS_PER_DAY);
}

export function buildTotalSetValueMetric(
  cards: CardWithPrice[],
  priceSource: CardsMetaPriceSource
): SetStatMetric {
  const totalCards = cards.length;
  const priced = cards.filter(
    (c) => c.marketPrice !== null && Number.isFinite(c.marketPrice as number)
  );
  const pricedCount = priced.length;
  const sum = priced.reduce((acc, c) => acc + (c.marketPrice as number), 0);
  const source = priceSourceLabel(priceSource);

  if (pricedCount === 0) {
    return {
      value: "N/A",
      naReason: "No usable market prices for this set",
      source,
      note: totalCards > 0 ? `based on 0 of ${totalCards} priced cards` : null,
    };
  }

  const note =
    pricedCount < totalCards
      ? `based on ${pricedCount} of ${totalCards} priced cards`
      : `based on ${pricedCount} of ${totalCards} priced cards`;

  return {
    value: formatPrice(sum),
    source,
    note,
  };
}

export function buildMomMetric(
  cardmarketHits: TcgdexCardmarketHit[],
  opts: {
    releaseDate?: string | null;
    tcgdexAvailable: boolean;
  }
): SetStatMetric {
  const ageDays = daysSinceRelease(opts.releaseDate ?? null);

  if (ageDays !== null && ageDays < MOM_MIN_DAYS) {
    return {
      value: "N/A",
      naReason: "Set less than ~30 days old",
      source: MOM_SOURCE,
      direction: null,
      percent: null,
    };
  }

  if (!opts.tcgdexAvailable) {
    return {
      value: "N/A",
      naReason: "TCGdex set could not be resolved",
      source: MOM_SOURCE,
      direction: null,
      percent: null,
    };
  }

  const usable = cardmarketHits.filter(
    (h) =>
      Number.isFinite(h.current) &&
      Number.isFinite(h.avg30) &&
      h.avg30 > 0
  );

  if (usable.length === 0) {
    return {
      value: "N/A",
      naReason: "Insufficient Cardmarket avg/avg30 data",
      source: MOM_SOURCE,
      direction: null,
      percent: null,
    };
  }

  const sumCurrent = usable.reduce((a, h) => a + h.current, 0);
  const sumAvg30 = usable.reduce((a, h) => a + h.avg30, 0);
  if (!(sumAvg30 > 0)) {
    return {
      value: "N/A",
      naReason: "Insufficient Cardmarket avg/avg30 data",
      source: MOM_SOURCE,
      direction: null,
      percent: null,
    };
  }

  const pct = ((sumCurrent - sumAvg30) / sumAvg30) * 100;
  const rounded = Math.round(pct * 10) / 10;
  const sign = rounded > 0 ? "+" : "";
  let direction: "up" | "down" | "flat" = "flat";
  if (rounded > 0.05) direction = "up";
  else if (rounded < -0.05) direction = "down";

  return {
    value: `${sign}${rounded.toFixed(1)}%`,
    percent: rounded,
    direction,
    source: MOM_SOURCE,
    note: `based on ${usable.length} cards with Cardmarket history`,
  };
}

export type BuildSetStatsInput = {
  cards: CardWithPrice[];
  priceSource: CardsMetaPriceSource;
  releaseDate?: string | null;
  /** When TCGdex was loaded (fallback or MoM-only), pass the bundle. */
  tcgdexBundle?: TcgdexSetPriceBundle | null;
  /** True when we attempted / could use TCGdex for MoM */
  tcgdexAttempted?: boolean;
};

export function buildSetStats(input: BuildSetStatsInput): SetStats {
  const releaseDate =
    input.releaseDate ?? input.tcgdexBundle?.releaseDate ?? null;

  const cardmarketHits = input.tcgdexBundle
    ? flattenCardmarketHits(input.tcgdexBundle.cardmarket)
    : [];

  const tcgdexAvailable = Boolean(input.tcgdexBundle);

  return {
    totalSetValue: buildTotalSetValueMetric(input.cards, input.priceSource),
    mom: buildMomMetric(cardmarketHits, {
      releaseDate,
      tcgdexAvailable: input.tcgdexAttempted === false ? false : tcgdexAvailable,
    }),
  };
}
