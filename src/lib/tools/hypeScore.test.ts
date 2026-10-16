import assert from "node:assert/strict";
import test from "node:test";
import {
  buzzPoints,
  collectDeckCards,
  countMentions,
  deckSharePoints,
  hypeTotal,
  mergePriceHistory,
  movementForCard,
  normalizeCardName,
  parseAtomEntries,
  playedAndPricey,
  priceMovement,
  releaseTimingPoints,
  swingEmptyLine,
  swingMatches,
  swingUnlockLine,
  tallyCopies,
  tallyDeckPresence,
  tournamentPoints,
  whyChips,
  windowMovement,
  BUZZ_MAX,
  HISTORY_MAX_POINTS,
  TIMING_MAX,
  TOURNAMENT_MAX,
} from "./hypeScore";
import { BUZZ_OK_TTL_MS, BUSY_TTL_MS, signalCacheTtl } from "./signals";

const NOW = Date.parse("2026-10-15T00:00:00Z");

test("release timing scores newer sets higher and skips a missing date", () => {
  assert.equal(releaseTimingPoints("2026-10-15", NOW).points, 20);
  assert.equal(releaseTimingPoints("2026-10-01", NOW).points, 20);
  assert.equal(releaseTimingPoints("2026-09-20", NOW).points, 15);
  assert.equal(releaseTimingPoints("2026-08-01", NOW).points, 9);
  assert.equal(releaseTimingPoints("2026-05-20", NOW).points, 4);
  assert.equal(releaseTimingPoints("2025-01-01", NOW).points, 1);
  assert.equal(releaseTimingPoints("2026-10-20", NOW).points, 18);
  const missing = releaseTimingPoints("", NOW);
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.points, 0);
  assert.equal(missing.max, TIMING_MAX);
  assert.equal(releaseTimingPoints("2026/10/15", NOW).points, 20);
});

test("tournament and buzz curves rise then flatten", () => {
  assert.equal(tournamentPoints(0), 0);
  assert.ok(tournamentPoints(1) > 0);
  assert.ok(tournamentPoints(8) > tournamentPoints(1));
  assert.ok(tournamentPoints(40) > tournamentPoints(8));
  assert.ok(tournamentPoints(80) <= TOURNAMENT_MAX);
  assert.equal(buzzPoints(0), 0);
  assert.ok(buzzPoints(1) > 0);
  assert.ok(buzzPoints(6) > buzzPoints(1));
  assert.ok(buzzPoints(30) <= BUZZ_MAX);
});

test("hype total is always out of 100 and rescales a missing source", () => {
  const full = hypeTotal({ timing: 20, tournament: 45, buzz: 35 });
  assert.equal(full.total, 100);
  assert.equal(full.max, 100);
  assert.equal(TIMING_MAX + TOURNAMENT_MAX + BUZZ_MAX, 100);
  assert.equal(full.label, "Hot");

  const partial = hypeTotal({ timing: 20, tournament: null, buzz: null });
  assert.equal(partial.total, 100);
  assert.equal(partial.max, 100);
  assert.equal(partial.label, "Hot");

  const quiet = hypeTotal({ timing: 1, tournament: 0, buzz: 0 });
  assert.equal(quiet.label, "Quiet");
  assert.equal(hypeTotal({ timing: null, tournament: null, buzz: null }).label, "No signals");
  assert.equal(hypeTotal({ timing: null, tournament: null, buzz: null }).max, 100);

  const warm = hypeTotal({ timing: 9, tournament: 18, buzz: 15 });
  assert.equal(warm.total, 42);
  assert.equal(warm.max, 100);
  assert.equal(warm.label, "Warm");
});

test("deck share scores 41 percent as 18 of 45 and explains why", () => {
  assert.equal(deckSharePoints(41, 100), 18);
  assert.equal(deckSharePoints(100, 100), 45);
  assert.equal(deckSharePoints(0, 20), 0);
  const chips = whyChips({
    decks: 41,
    decklists: 100,
    mentions: 3,
    releaseDate: "2026-10-06",
    now: NOW,
  });
  assert.deepEqual(chips, ["In 41% of decks", "3 Reddit posts", "Set out 9 days"]);
  assert.equal(playedAndPricey(0.1, 5), true);
  assert.equal(playedAndPricey(0.09, 20), false);
  assert.equal(playedAndPricey(0.4, 4), false);
});

test("mentions match a card name and not a longer name", () => {
  const posts = [
    { text: "Pulled a Charizard ex from the box" },
    { text: "Charizard is still the chase" },
    { text: "mew is cute but mewtwo is the play" },
  ];
  assert.equal(countMentions("Charizard ex", posts), 1);
  assert.equal(countMentions("Charizard", posts), 2);
  assert.equal(countMentions("Mew", posts), 1);
  assert.equal(countMentions("Mewtwo", posts), 1);
  assert.equal(countMentions("ex", posts), 0);
  assert.equal(normalizeCardName("Monkey.D.Luffy"), "monkey d luffy");
});

test("price movement waits for two different snapshots", () => {
  assert.deepEqual(priceMovement([]), { status: "collecting" });
  assert.deepEqual(priceMovement([{ at: "2026-10-01T00:00:00Z", price: 10 }]), {
    status: "collecting",
  });
  const ready = priceMovement([
    { at: "2026-10-02T00:00:00Z", price: 12 },
    { at: "2026-10-01T00:00:00Z", price: 10 },
    { at: "2026-10-02T00:00:00Z", price: 12 },
  ]);
  assert.deepEqual(ready, { status: "ready", from: 10, to: 12, delta: 2, percent: 20 });
});

test("history keeps one point per as-of time", () => {
  const first = mergePriceHistory(null, { at: "a", prices: { card: 5 } }, {
    category: "pokemon",
    setId: "me5",
  });
  const same = mergePriceHistory(first, { at: "a", prices: { card: 9 } }, {
    category: "pokemon",
    setId: "me5",
  });
  assert.equal(same.points.length, 1);
  assert.equal(same.points[0].prices.card, 5);
  const next = mergePriceHistory(same, { at: "b", prices: { card: 8 } }, {
    category: "pokemon",
    setId: "me5",
  });
  assert.equal(next.points.length, 2);
  assert.deepEqual(movementForCard(next, "card"), {
    status: "ready",
    from: 5,
    to: 8,
    delta: 3,
    percent: 60,
  });
  assert.deepEqual(movementForCard(first, "missing"), { status: "collecting" });
  let history = mergePriceHistory(null, { at: "0", prices: {} }, { category: "pokemon", setId: "me5" }, 3);
  for (let index = 1; index < 5; index += 1) {
    history = mergePriceHistory(history, { at: String(index), prices: {} }, { category: "pokemon", setId: "me5" }, 3);
  }
  assert.deepEqual(history.points.map((point) => point.at), ["2", "3", "4"]);
  let capped = mergePriceHistory(null, { at: "0", prices: {} }, { category: "pokemon", setId: "me5" });
  for (let index = 1; index <= HISTORY_MAX_POINTS + 2; index += 1) {
    capped = mergePriceHistory(capped, { at: String(index), prices: {} }, { category: "pokemon", setId: "me5" });
  }
  assert.equal(capped.points.length, HISTORY_MAX_POINTS);
});

test("windowed movement waits until the log spans the window", () => {
  const short = windowMovement(
    [
      { at: "2026-10-01", price: 10 },
      { at: "2026-10-03", price: 12 },
    ],
    7,
  );
  assert.equal(short.status, "collecting");
  if (short.status === "collecting") assert.equal(short.unlocksOn, "2026-10-08");
  assert.equal(swingUnlockLine("7d", "2026-10-08"), "7-day moves unlock Oct 8, 2026");

  const ready = windowMovement(
    [
      { at: "2026-10-01", price: 10 },
      { at: "2026-10-08", price: 12 },
    ],
    7,
  );
  assert.equal(ready.status, "ready");
  if (ready.status === "ready") assert.equal(ready.percent, 20);
  assert.equal(swingMatches(ready, "up", 10), true);
  assert.equal(swingMatches(ready, "down", 10), false);
  assert.equal(swingMatches(ready, "both", 25), false);
  assert.equal(
    swingEmptyLine(10, "7d"),
    "No cards moved ±10% above $1 in 7 days, try ±5%",
  );
});

test("deck presence counts a deck once and keeps its copies", () => {
  const presence = tallyDeckPresence([
    [
      { name: "Charizard ex", count: 3 },
      { name: "Charizard ex", count: 1 },
    ],
    [{ name: "Charizard ex", count: 2 }],
    [{ name: "Pikachu", count: 4 }],
  ]);
  assert.equal(presence.decks["charizard ex"], 2);
  assert.equal(presence.copies["charizard ex"], 6);
  assert.equal(presence.decks.pikachu, 1);
});

test("reddit successes cache for 12 hours and a busy response is shorter", () => {
  assert.equal(signalCacheTtl("buzz", "ok"), BUZZ_OK_TTL_MS);
  assert.equal(BUZZ_OK_TTL_MS, 12 * 60 * 60 * 1000);
  assert.equal(signalCacheTtl("buzz", "busy"), BUSY_TTL_MS);
  assert.equal(signalCacheTtl("tournament", "ok"), 6 * 60 * 60 * 1000);
});

test("decklist walking counts leaders without a count and ignores player names", () => {
  const cards = collectDeckCards({
    name: "Fabio",
    deck: { name: "N's Zoroark" },
    decklist: {
      leader: { name: "Monkey.D.Luffy", set: "OP16", number: "022" },
      pokemon: [{ count: 4, set: "JTG", number: "98", name: "N's Zoroark ex" }],
    },
  });
  const copies = tallyCopies(cards);
  assert.equal(copies["monkey d luffy"], 1);
  assert.equal(copies["n s zoroark ex"], 4);
  assert.equal(copies.fabio, undefined);
  assert.equal(copies["n s zoroark"], undefined);
});

test("reddit atom entries become searchable text", () => {
  const xml = `<?xml version="1.0"?><feed><entry><title>Charizard ex spike</title><content type="html">Bought a &amp; Charizard ex</content></entry><entry><title></title><content> </content></entry></feed>`;
  const posts = parseAtomEntries(xml);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].title, "Charizard ex spike");
  assert.match(posts[0].text, /Charizard ex/);
  assert.equal(countMentions("Charizard ex", posts), 1);
});
