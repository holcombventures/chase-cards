/**
 * Hype score from deck share, public-post buzz, and release timing.
 * The number on the page is always out of 100. A blocked source is left out
 * and the remaining points are rescaled, instead of being treated as zero usage.
 */

export const TIMING_MAX = 20;
export const TOURNAMENT_MAX = 45;
export const BUZZ_MAX = 35;
export const HISTORY_MAX_POINTS = 35;

export const REDDIT_BUSY_DETAIL =
  "Reddit is busy right now, so hype uses tournaments + set age for this game";
export const RIFTBOUND_NO_DECKS = "No public decklists yet";
export const FAVORITES_EMPTY = "No favorites yet. Tap ☆ on any card…";

export type SignalStatus = "ok" | "unavailable" | "skipped" | "busy";

export type TournamentSignal = {
  status: SignalStatus;
  detail: string;
  gameId: string | null;
  decklists: number;
  /** Copy totals across sampled decklists, keyed by normalized card name. */
  copies: Record<string, number>;
  /** Decklists that include the card at least once. */
  decks: Record<string, number>;
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
      points: 18,
      max: TIMING_MAX,
      label: `Releases in ${-days} day${-days === 1 ? "" : "s"}`,
    };
  }
  if (days <= 14) {
    return { status: "ok", points: 20, max: TIMING_MAX, label: `Released ${days} day${days === 1 ? "" : "s"} ago` };
  }
  if (days <= 45) {
    return { status: "ok", points: 15, max: TIMING_MAX, label: `Released ${days} days ago` };
  }
  if (days <= 90) {
    return { status: "ok", points: 9, max: TIMING_MAX, label: `Released ${days} days ago` };
  }
  if (days <= 180) {
    return { status: "ok", points: 4, max: TIMING_MAX, label: `Released ${days} days ago` };
  }
  return { status: "ok", points: 1, max: TIMING_MAX, label: `Released ${days} days ago` };
}

/** Deck share of the sampled lists, capped at the tournament weight. */
export function deckSharePoints(decks: number, decklists: number): number {
  if (!Number.isFinite(decks) || decks <= 0 || !Number.isFinite(decklists) || decklists <= 0) return 0;
  const share = Math.min(1, decks / decklists);
  return Math.round(TOURNAMENT_MAX * share);
}

/** Older copy-count curve. The tracker scores deck share; this remains for tests. */
export function tournamentPoints(copies: number): number {
  if (!Number.isFinite(copies) || copies <= 0) return 0;
  return Math.round(TOURNAMENT_MAX * (1 - Math.exp(-copies / 12)));
}

export function buzzPoints(mentions: number): number {
  if (!Number.isFinite(mentions) || mentions <= 0) return 0;
  return Math.round(BUZZ_MAX * (1 - Math.exp(-mentions / 3)));
}

/** Always out of 100. Missing sources are dropped, then the rest is rescaled. */
export function hypeTotal(parts: HypeParts): HypeTotal {
  let earned = 0;
  let available = 0;
  if (parts.timing !== null) {
    earned += parts.timing;
    available += TIMING_MAX;
  }
  if (parts.tournament !== null) {
    earned += parts.tournament;
    available += TOURNAMENT_MAX;
  }
  if (parts.buzz !== null) {
    earned += parts.buzz;
    available += BUZZ_MAX;
  }
  if (available <= 0) return { total: 0, max: 100, label: "No signals" };
  const ratio = earned / available;
  const total = Math.round(ratio * 100);
  const label = ratio >= 0.72 ? "Hot" : ratio >= 0.4 ? "Warm" : "Quiet";
  return { total, max: 100, label };
}

export function whyChips(input: {
  decks: number | null;
  decklists: number;
  mentions: number | null;
  releaseDate: string | null | undefined;
  now?: number;
}): string[] {
  const chips: string[] = [];
  if (input.decks !== null && input.decklists > 0) {
    const pct = Math.round((Math.min(input.decks, input.decklists) / input.decklists) * 100);
    chips.push(`In ${pct}% of decks`);
  }
  if (input.mentions !== null && input.mentions > 0) {
    chips.push(`${input.mentions} Reddit post${input.mentions === 1 ? "" : "s"}`);
  }
  const released = parseReleaseMs(input.releaseDate);
  if (released !== null) {
    const days = Math.round(((input.now ?? Date.now()) - released) / 86_400_000);
    if (days < 0) {
      const ahead = -days;
      chips.push(`Out in ${ahead} day${ahead === 1 ? "" : "s"}`);
    } else if (days === 0) {
      chips.push("Set out today");
    } else {
      chips.push(`Set out ${days} day${days === 1 ? "" : "s"}`);
    }
  }
  return chips;
}

export function playedAndPricey(share: number | null, price: number | null): boolean {
  return share !== null && share >= 0.1 && price !== null && price >= 5;
}

export function averageCopies(copies: number, decks: number): number | null {
  if (!Number.isFinite(decks) || decks <= 0 || !Number.isFinite(copies)) return null;
  return copies / decks;
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
  maxPoints = HISTORY_MAX_POINTS,
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

export type SwingWindow = "24h" | "7d" | "30d";

export const SWING_WINDOW_DAYS: Record<SwingWindow, number> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
};

export type WindowMovement =
  | { status: "collecting"; unlocksOn: string | null }
  | {
      status: "ready";
      from: number;
      to: number;
      delta: number;
      percent: number | null;
      fromAt: string;
      toAt: string;
    };

export function pointTime(at: string): number | null {
  const day = at.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day) && at.length === 10) {
    const ms = Date.parse(`${day}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(at);
  return Number.isFinite(ms) ? ms : null;
}

export function formatUnlockDate(isoDay: string): string {
  const ms = Date.parse(`${isoDay.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ms)) return isoDay;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const date = new Date(ms);
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`;
}

export function swingUnlockLine(windowId: SwingWindow, unlocksOn: string | null): string {
  const label = windowId === "24h" ? "24-hour" : windowId === "30d" ? "30-day" : "7-day";
  if (!unlocksOn) return `${label} moves unlock after daily prices cover that window.`;
  return `${label} moves unlock ${formatUnlockDate(unlocksOn)}`;
}

export function swingEmptyLine(threshold: number, windowId: SwingWindow): string {
  const phrase = windowId === "24h" ? "24 hours" : windowId === "30d" ? "30 days" : "7 days";
  const base = `No cards moved ±${threshold}% above $1 in ${phrase}`;
  if (threshold === 5) return `${base}.`;
  return `${base}, try ±5%`;
}

/**
 * Ready only when the log spans the window. The comparison is the latest
 * price against the last price at or before the start of that window.
 */
export function windowMovement(
  points: readonly PricePoint[],
  windowDays: number,
  now = Date.now(),
): WindowMovement {
  const byAt = new Map<string, { at: string; price: number; time: number }>();
  for (const point of points) {
    const time = pointTime(point.at);
    if (time === null || !Number.isFinite(point.price)) continue;
    byAt.set(point.at, { at: point.at, price: point.price, time });
  }
  const ordered = [...byAt.values()].sort((a, b) => a.time - b.time);
  if (!ordered.length) return { status: "collecting", unlocksOn: null };
  const earliest = ordered[0];
  const need = windowDays * 86_400_000;
  const unlockMs = earliest.time + need;
  const unlocksOn = new Date(unlockMs).toISOString().slice(0, 10);
  const latest = ordered[ordered.length - 1];
  if (ordered.length < 2 || latest.time - earliest.time < need) {
    return { status: "collecting", unlocksOn };
  }
  const cutoff = Math.min(latest.time, now) - need;
  let baseline = earliest;
  for (const point of ordered) {
    if (point.time <= cutoff) baseline = point;
  }
  if (baseline.at === latest.at) return { status: "collecting", unlocksOn };
  const delta = latest.price - baseline.price;
  const percent = baseline.price > 0 ? (delta / baseline.price) * 100 : null;
  return {
    status: "ready",
    from: baseline.price,
    to: latest.price,
    delta,
    percent,
    fromAt: baseline.at,
    toAt: latest.at,
  };
}

export function windowMovementForCard(
  history: SetPriceHistory | null,
  cardId: string,
  windowDays: number,
  now = Date.now(),
): WindowMovement {
  if (!history) return { status: "collecting", unlocksOn: null };
  const points: PricePoint[] = [];
  for (const point of history.points) {
    const price = point.prices[cardId];
    if (typeof price === "number") points.push({ at: point.at, price });
  }
  return windowMovement(points, windowDays, now);
}

export type SwingDirection = "up" | "down" | "both";

export function swingMatches(
  movement: WindowMovement,
  direction: SwingDirection,
  thresholdPct: number,
): boolean {
  if (movement.status !== "ready" || movement.percent === null) return false;
  if (Math.abs(movement.percent) + 1e-9 < thresholdPct) return false;
  if (direction === "up") return movement.percent > 0;
  if (direction === "down") return movement.percent < 0;
  return movement.percent !== 0;
}

export function isNewOrUpcoming(releaseDate: string | null | undefined, now = Date.now()): boolean {
  const released = parseReleaseMs(releaseDate);
  if (released === null) return false;
  const days = (now - released) / 86_400_000;
  return days <= 45;
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

/** One count per decklist that includes the name, plus the copies those decks play. */
export function tallyDeckPresence(decks: readonly (readonly DeckCard[])[]): {
  decks: Record<string, number>;
  copies: Record<string, number>;
} {
  const deckCounts: Record<string, number> = {};
  const copies: Record<string, number> = {};
  for (const cards of decks) {
    const seen = new Set<string>();
    const inDeck: Record<string, number> = {};
    for (const card of cards) {
      const key = normalizeCardName(card.name);
      if (!key) continue;
      seen.add(key);
      inDeck[key] = (inDeck[key] ?? 0) + card.count;
    }
    for (const key of seen) {
      deckCounts[key] = (deckCounts[key] ?? 0) + 1;
      copies[key] = (copies[key] ?? 0) + (inDeck[key] ?? 0);
    }
  }
  return { decks: deckCounts, copies };
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
