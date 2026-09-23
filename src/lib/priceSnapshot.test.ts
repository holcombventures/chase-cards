import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { CardsApiBody } from "./cardCacheModel";
import { formatPricesAsOf } from "./prices";
import {
  PRICE_SNAPSHOT_TTL_MS,
  buildPriceSnapshot,
  mergeFullBodyWithSnapshot,
  parsePriceSnapshot,
  priceCacheRefreshAllowed,
  pricePayloadFromSnapshot,
  priceSnapshotKey,
  snapshotIsFresh,
} from "./priceSnapshot";
import {
  memoryPriceSnapshotBackend,
  readFreshPriceSnapshot,
  resetPriceSnapshotStoreForTests,
  savePriceSnapshot,
  setPriceSnapshotBackendForTests,
} from "./priceSnapshotStore";
import type { CardWithPrice } from "./types";

function sampleCard(overrides: Partial<CardWithPrice> = {}): CardWithPrice {
  return {
    id: "base1-4",
    name: "Charizard",
    number: "4",
    rarity: "Rare Holo",
    images: {
      small: "https://images.pokemontcg.io/base1/4.png",
      large: "https://images.pokemontcg.io/base1/4_hires.png",
    },
    set: { id: "base1", name: "Base", printedTotal: 102, total: 102 },
    marketPrice: 400,
    priceVariant: "holofoil",
    priceUpdatedAt: "2024-01-01",
    priceSource: "pokemontcg",
    ...overrides,
  };
}

function bodyFor(card: CardWithPrice, category: string): CardsApiBody {
  return {
    data: [card],
    meta: {
      category,
      total: 1,
      pricedCount: card.marketPrice === null ? 0 : 1,
      missingPriceCount: card.marketPrice === null ? 1 : 0,
      priceSource: card.priceSource ?? "none",
      fallbackUsed: false,
      pricesAsOf: "2026-09-23T18:00:00.000Z",
      stats: null,
    },
  };
}

afterEach(() => {
  resetPriceSnapshotStoreForTests();
});

test("pokemon and one piece snapshots do not share a key", () => {
  assert.equal(priceSnapshotKey("pokemon", "base1"), "pokemon/base1");
  assert.equal(priceSnapshotKey("one-piece", "OP-01"), "one-piece/OP-01");
  assert.notEqual(
    priceSnapshotKey("pokemon", "OP-01"),
    priceSnapshotKey("one-piece", "OP-01"),
  );
});

test("snapshot stays fresh for 4 hours and expires after that", () => {
  const storedAt = 1_000_000;
  assert.equal(snapshotIsFresh(storedAt, storedAt + PRICE_SNAPSHOT_TTL_MS), true);
  assert.equal(
    snapshotIsFresh(storedAt, storedAt + PRICE_SNAPSHOT_TTL_MS + 1),
    false,
  );
  assert.equal(PRICE_SNAPSHOT_TTL_MS, 4 * 60 * 60 * 1000);
});

test("snapshot keeps null prices and the original as-of time", () => {
  const card = sampleCard({
    marketPrice: null,
    priceVariant: null,
    priceUpdatedAt: null,
    priceSource: null,
  });
  const snap = buildPriceSnapshot("pokemon", "sv1", bodyFor(card, "pokemon"), 5_000);
  assert.equal(snap.data[0].marketPrice, null);
  assert.equal(snap.data[0].priceSource, null);
  assert.equal(snap.pricesAsOf, "2026-09-23T18:00:00.000Z");
  assert.equal(snap.storedAt, 5_000);
  assert.equal("images" in snap.data[0], false);
});

test("fresh snapshot is served and an expired one is a miss", async () => {
  setPriceSnapshotBackendForTests(memoryPriceSnapshotBackend());
  const now = 10_000;
  await savePriceSnapshot(
    "one-piece",
    "OP-01",
    bodyFor(sampleCard({ priceSource: "optcgapi", marketPrice: 12 }), "one-piece"),
    now,
  );

  const hit = await readFreshPriceSnapshot("one-piece", "OP-01", now + 60_000);
  assert.ok(hit);
  assert.equal(hit?.data[0].marketPrice, 12);
  assert.equal(hit?.pricesAsOf, "2026-09-23T18:00:00.000Z");
  assert.equal(pricePayloadFromSnapshot(hit!, "hit").meta.priceCache, "hit");
  assert.equal(pricePayloadFromSnapshot(hit!, "hit").meta.part, "prices");

  const expired = await readFreshPriceSnapshot(
    "one-piece",
    "OP-01",
    now + PRICE_SNAPSHOT_TTL_MS + 1,
  );
  assert.equal(expired, null);
});

test("a corrupt snapshot is ignored", () => {
  assert.equal(parsePriceSnapshot({ v: 1, data: [{ id: 1 }] }), null);
  assert.equal(parsePriceSnapshot(null), null);
});

test("merging a snapshot replaces prices and leaves art urls", () => {
  const catalog = bodyFor(sampleCard({ marketPrice: null, priceSource: null }), "pokemon");
  const snap = buildPriceSnapshot(
    "pokemon",
    "base1",
    bodyFor(sampleCard({ marketPrice: 410 }), "pokemon"),
    20,
  );
  const merged = mergeFullBodyWithSnapshot(catalog, snap);
  assert.equal(merged.data[0].marketPrice, 410);
  assert.equal(merged.data[0].images.large, sampleCard().images.large);
  assert.equal(merged.meta?.pricesAsOf, snap.pricesAsOf);
  assert.equal(merged.meta?.part, "full");
});

test("production ignores forced price refresh", () => {
  assert.equal(priceCacheRefreshAllowed("production"), false);
  assert.equal(priceCacheRefreshAllowed("deploy-preview"), true);
  assert.equal(priceCacheRefreshAllowed(undefined), true);
});

test("prices as of label is present only for a real timestamp", () => {
  assert.equal(formatPricesAsOf(null), null);
  assert.equal(formatPricesAsOf("not-a-date"), null);
  const label = formatPricesAsOf("2026-09-23T18:00:00.000Z");
  assert.ok(label?.startsWith("Prices as of "));
});
