import assert from "node:assert/strict";
import test from "node:test";
import {
  buzzPoints,
  collectDeckCards,
  countMentions,
  hypeTotal,
  mergePriceHistory,
  movementForCard,
  normalizeCardName,
  parseAtomEntries,
  priceMovement,
  releaseTimingPoints,
  tallyCopies,
  tournamentPoints,
  BUZZ_MAX,
  TIMING_MAX,
  TOURNAMENT_MAX,
} from "./hypeScore";

const NOW = Date.parse("2026-10-15T00:00:00Z");

test("release timing scores newer sets higher and skips a missing date", () => {
  assert.equal(releaseTimingPoints("2026-10-15", NOW).points, 40);
  assert.equal(releaseTimingPoints("2026-10-01", NOW).points, 40);
  assert.equal(releaseTimingPoints("2026-09-20", NOW).points, 30);
  assert.equal(releaseTimingPoints("2026-08-01", NOW).points, 18);
  assert.equal(releaseTimingPoints("2026-05-20", NOW).points, 8);
  assert.equal(releaseTimingPoints("2025-01-01", NOW).points, 2);
  assert.equal(releaseTimingPoints("2026-10-20", NOW).points, 36);
  const missing = releaseTimingPoints("", NOW);
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.points, 0);
  assert.equal(releaseTimingPoints("2026/10/15", NOW).points, 40);
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

test("unavailable signals are left out of the hype total", () => {
  const full = hypeTotal({ timing: 40, tournament: 35, buzz: 25 });
  assert.equal(full.total, 100);
  assert.equal(full.max, TIMING_MAX + TOURNAMENT_MAX + BUZZ_MAX);
  assert.equal(full.label, "Hot");

  const partial = hypeTotal({ timing: 40, tournament: null, buzz: null });
  assert.equal(partial.total, 40);
  assert.equal(partial.max, 40);
  assert.equal(partial.label, "Hot");

  const quiet = hypeTotal({ timing: 2, tournament: 0, buzz: 0 });
  assert.equal(quiet.label, "Quiet");
  assert.equal(hypeTotal({ timing: null, tournament: null, buzz: null }).label, "No signals");

  const warm = hypeTotal({ timing: 18, tournament: 12, buzz: 12 });
  assert.equal(warm.total, 42);
  assert.equal(warm.max, 100);
  assert.equal(warm.label, "Warm");
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
