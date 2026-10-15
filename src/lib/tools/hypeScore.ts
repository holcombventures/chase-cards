/**
 * Hype score from release timing, tournament copies, and public-post buzz.
 * Each component is reported on its own. A blocked source is left out of the
 * total instead of being treated as zero usage.
 */

export const TIMING_MAX = 40;
export const TOURNAMENT_MAX = 35;
export const BUZZ_MAX = 25;

export type SignalStatus = "ok" | "unavailable" | "skipped";

export type TournamentSignal = {
  status: SignalStatus;
  detail: string;
  gameId: string | null;
  decklists: number;
  copies: Record<string, number>;
};

export type BuzzPost = { title: string; text: string };

export type BuzzSignal = {
  status: SignalStatus;
  detail: string;
  subreddit: string | null;
  posts: BuzzPost[];
};

export type ReleaseTiming = {
  status: SignalStatus;
  points: number;
  max: number;
  label: string;
};

export type PricePoint = { at: string; price: number };

export type PriceMovement =
  | { status: "collecting" }
  | {
      status: "ready";
      from: number;
      to: number;
      delta: number;
      percent: number | null;
    };

export type HypeParts = {
  timing: number | null;
  tournament: number | null;
  buzz: number | null;
};

export type HypeTotal = {
  total: number;
  max: number;
  label: "Hot" | "Warm" | "Quiet" | "No signals";
};

export function normalizeCardName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function parseReleaseMs(releaseDate: string | null | undefined): number | null {
  const raw = (releaseDate || "").trim().replace(/\//g, "-");
  if (!raw) return null;
  const day = raw.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const ms = Date.parse(`${day}T00:00:00Z`);
  return Number.isFinite(ms) ? ms : null;
}

/** Newer sets score higher. A missing date is unavailable, not a zero-day release. */
export function releaseTimingPoints(
  releaseDate: string | null | undefined,
  now = Date.now(),
): ReleaseTiming {
  const released = parseReleaseMs(releaseDate);
  if (released === null) {
    return {
      status: "unavailable",
      points: 0,
      max: TIMING_MAX,
      label: "Release date unavailable",
    };
  }
  const days = Math.round((now - released) / 86_400_000);
  if (days < 0) {
    return {
      status: "ok",
      points: 36,
      max: TIMING_MAX,
      label: `Releases in ${-days} day${-days === 1 ? "" : "s"}`,
    };
  }
  if (days <= 14) {
    return { status: "ok", points: 40, max: TIMING_MAX, label: `Released ${days} day${days === 1 ? "" : "s"} ago` };
  }
  if (days <= 45) {
    return { status: "ok", points: 30, max: TIMING_MAX, label: `Released ${days} days ago` };
  }
  if (days <= 90) {
    return { status: "ok", points: 18, max: TIMING_MAX, label: `Released ${days} days ago` };
  }
  if (days <= 180) {
    return { status: "ok", points: 8, max: TIMING_MAX, label: `Released ${days} days ago` };
  }
  return { status: "ok", points: 2, max: TIMING_MAX, label: `Released ${days} days ago` };
}

/** Diminishing curve so one copy registers and a staple approaches the cap. */
export function tournamentPoints(copies: number): number {
  if (!Number.isFinite(copies) || copies <= 0) return 0;
  return Math.round(TOURNAMENT_MAX * (1 - Math.exp(-copies / 12)));
}

export function buzzPoints(mentions: number): number {
  if (!Number.isFinite(mentions) || mentions <= 0) return 0;
  return Math.round(BUZZ_MAX * (1 - Math.exp(-mentions / 3)));
}

export function hypeTotal(parts: HypeParts): HypeTotal {
  let total = 0;
  let max = 0;
  if (parts.timing !== null) {
    total += parts.timing;
    max += TIMING_MAX;
  }
  if (parts.tournament !== null) {
    total += parts.tournament;
    max += TOURNAMENT_MAX;
  }
  if (parts.buzz !== null) {
    total += parts.buzz;
    max += BUZZ_MAX;
  }
  if (max <= 0) return { total: 0, max: 0, label: "No signals" };
  const ratio = total / max;
  const label = ratio >= 0.72 ? "Hot" : ratio >= 0.4 ? "Warm" : "Quiet";
  return { total, max, label };
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Count posts that mention the card name as its own phrase. */
export function countMentions(name: string, posts: readonly { text: string }[]): number {
  const needle = normalizeCardName(name);
  if (needle.length < 3) return 0;
  const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(needle)}([^a-z0-9]|$)`);
  let count = 0;
  for (const post of posts) {
    if (pattern.test(normalizeCardName(post.text))) count += 1;
  }
  return count;
}

/**
 * Movement needs two snapshots taken at different as-of times.
 * Until then the tool is still collecting data.
 */
export function priceMovement(points: readonly PricePoint[]): PriceMovement {
  const byAt = new Map<string, number>();
  for (const point of points) {
    if (!point.at || !Number.isFinite(point.price)) continue;
    byAt.set(point.at, point.price);
  }
  if (byAt.size < 2) return { status: "collecting" };
  const ordered = [...byAt.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const from = ordered[0][1];
  const to = ordered[ordered.length - 1][1];
  const delta = to - from;
  const percent = from > 0 ? (delta / from) * 100 : null;
  return { status: "ready", from, to, delta, percent };
}

export type HistoryPoint = { at: string; prices: Record<string, number> };

export type SetPriceHistory = {
  v: 1;
  category: string;
  setId: string;
  points: HistoryPoint[];
};

/** Append a snapshot only when its as-of time is new. Caps the log. */
export function mergePriceHistory(
  history: SetPriceHistory | null,
  point: HistoryPoint,
  identity: { category: string; setId: string },
  maxPoints = 16,
): SetPriceHistory {
  const base: SetPriceHistory = history ?? {
    v: 1,
    category: identity.category,
    setId: identity.setId,
    points: [],
  };
  const last = base.points[base.points.length - 1];
  if (last && last.at === point.at) return base;
  return {
    v: 1,
    category: identity.category,
    setId: identity.setId,
    points: [...base.points, point].slice(-maxPoints),
  };
}

export function movementForCard(
  history: SetPriceHistory | null,
  cardId: string,
): PriceMovement {
  if (!history) return { status: "collecting" };
  const points: PricePoint[] = [];
  for (const point of history.points) {
    const price = point.prices[cardId];
    if (typeof price === "number") points.push({ at: point.at, price });
  }
  return priceMovement(points);
}

export type DeckCard = {
  name: string;
  count: number;
  set?: string;
  number?: string;
};

/** Walk a Limitless decklist and keep objects that name a card. */
export function collectDeckCards(node: unknown, out: DeckCard[] = [], depth = 0): DeckCard[] {
  if (depth > 8 || node == null) return out;
  if (Array.isArray(node)) {
    for (const item of node) collectDeckCards(item, out, depth + 1);
    return out;
  }
  if (typeof node !== "object") return out;
  const record = node as Record<string, unknown>;
  if (typeof record.name === "string" && record.name.trim()) {
    const hasCount = record.count !== undefined && record.count !== null;
    const hasSet = typeof record.set === "string";
    if (hasCount || hasSet) {
      const count = Number(hasCount ? record.count : 1);
      if (Number.isFinite(count) && count > 0) {
        out.push({
          name: record.name.trim(),
          count,
          set: typeof record.set === "string" ? record.set : undefined,
          number: record.number == null ? undefined : String(record.number),
        });
      }
    }
  }
  for (const value of Object.values(record)) {
    if (value && typeof value === "object") collectDeckCards(value, out, depth + 1);
  }
  return out;
}

export function tallyCopies(cards: readonly DeckCard[]): Record<string, number> {
  const copies: Record<string, number> = {};
  for (const card of cards) {
    const key = normalizeCardName(card.name);
    if (!key) continue;
    copies[key] = (copies[key] ?? 0) + card.count;
  }
  return copies;
}

export function parseAtomEntries(xml: string): { title: string; text: string }[] {
  const chunks = xml.split(/<entry\b[^>]*>/i).slice(1);
  const posts: { title: string; text: string }[] = [];
  for (const chunk of chunks) {
    const body = chunk.split(/<\/entry>/i)[0] ?? chunk;
    const title = decodeXml(stripTags(firstTag(body, "title")));
    const content = decodeXml(stripTags(firstTag(body, "content") || firstTag(body, "summary")));
    const text = `${title}\n${content}`.trim();
    if (!text) continue;
    posts.push({ title, text });
  }
  return posts;
}

function firstTag(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match?.[1] ?? "";
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeXml(value: string): string {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .trim();
}
