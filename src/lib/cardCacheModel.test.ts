import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  applyPricePatches,
  cacheHeaders,
  catalogIsFresh,
  mergeCardPrices,
  payloadCacheKey,
  pricesAreFresh,
  PRICE_MEMORY_TTL_MS,
  slimCatalogCard,
  toCatalogBody,
  toPricesBody,
  type CardsApiBody,
} from "./cardCacheModel";
import {
  loadSharedPayload,
  MAX_PAYLOAD_ENTRIES,
  readCachedPayload,
  resetPayloadCacheForTests,
  writePayload,
} from "./setPayloadCache";
import {
  readSetCardCache,
  resetSetCardCacheForTests,
  SET_CARD_CACHE_LIMIT,
  writeSetCardCache,
} from "./setCardCache";
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
    tcgplayer: { updatedAt: "2024-01-01", prices: { holofoil: { market: 400 } } },
    marketPrice: 400,
    priceVariant: "holofoil",
    priceUpdatedAt: "2024-01-01",
    priceSource: "pokemontcg",
    ...overrides,
  };
}

const fullBody: CardsApiBody = {
  data: [sampleCard()],
  meta: {
    category: "pokemon",
    total: 1,
    pricedCount: 1,
    priceSource: "pokemontcg",
    fallbackUsed: false,
    stats: null,
    releaseDate: "1999/01/09",
  },
};

afterEach(() => {
  resetPayloadCacheForTests();
  resetSetCardCacheForTests();
});

test("catalog body keeps art urls and strips prices", () => {
  const catalog = toCatalogBody(fullBody);
  assert.equal(catalog.data[0].images.large, sampleCard().images.large);
  assert.equal(catalog.data[0].marketPrice, null);
  assert.equal(catalog.meta.part, "catalog");
  assert.equal("tcgplayer" in catalog.data[0], false);
  assert.deepEqual(slimCatalogCard(sampleCard()).images, sampleCard().images);
});

test("prices body is id plus market fields only", () => {
  const prices = toPricesBody(fullBody);
  assert.deepEqual(prices.data[0], {
    id: "base1-4",
    marketPrice: 400,
    priceVariant: "holofoil",
    priceUpdatedAt: "2024-01-01",
    priceSource: "pokemontcg",
  });
  assert.equal(prices.meta.pricedCount, 1);
  assert.equal(prices.meta.part, "prices");
});

test("price patches replace market fields and empty patches keep the last price", () => {
  const base = [slimCatalogCard(sampleCard())];
  const merged = applyPricePatches(base, [
    {
      id: "base1-4",
      marketPrice: 410,
      priceVariant: "holofoil",
      priceUpdatedAt: "2024-02-01",
      priceSource: "pokemontcg",
    },
  ]);
  assert.equal(merged[0].marketPrice, 410);
  assert.equal(merged[0].images.large, sampleCard().images.large);
  assert.equal(mergeCardPrices(merged, []).length, 1);
  assert.equal(mergeCardPrices(merged, [])[0].marketPrice, 410);
});

test("cache headers split catalog from prices", () => {
  const catalog = cacheHeaders("catalog");
  const prices = cacheHeaders("prices");
  const full = cacheHeaders("full");
  assert.match(catalog["Cache-Control"], /max-age=3600/);
  assert.match(catalog["Netlify-CDN-Cache-Control"], /s-maxage=86400/);
  assert.match(prices["Cache-Control"], /max-age=0/);
  assert.match(prices["Netlify-CDN-Cache-Control"], /s-maxage=60/);
  assert.equal(full["Cache-Control"], "private, no-store");
  assert.equal(pricesAreFresh(1_000, 1_000 + PRICE_MEMORY_TTL_MS), true);
  assert.equal(pricesAreFresh(1_000, 1_000 + PRICE_MEMORY_TTL_MS + 1), false);
  assert.equal(catalogIsFresh(1_000, 1_000 + 60_000), true);
});

test("payload key ignores part and shares one upstream load", async () => {
  const key = payloadCacheKey({
    category: "pokemon",
    setId: "base1",
    setName: "Base",
    releaseDate: "1999/01/09",
  });
  assert.equal(
    key,
    payloadCacheKey({
      category: "pokemon",
      setId: "base1",
      setName: "Base",
      releaseDate: "1999/01/09",
    }),
  );

  let calls = 0;
  const loader = async () => {
    calls += 1;
    await new Promise((resolve) => setTimeout(resolve, 15));
    return { ok: true as const, body: fullBody };
  };
  const [a, b] = await Promise.all([
    loadSharedPayload(key, loader, 5_000),
    loadSharedPayload(key, loader, 5_000),
  ]);
  assert.equal(calls, 1);
  assert.equal(a.ok && b.ok, true);

  const again = await loadSharedPayload(
    key,
    async () => {
      calls += 1;
      return { ok: true, body: fullBody };
    },
    5_000 + 1_000,
  );
  assert.equal(calls, 1);
  assert.equal(again.ok, true);

  const refreshed = await loadSharedPayload(
    key,
    async () => {
      calls += 1;
      return {
        ok: true as const,
        body: {
          ...fullBody,
          data: [sampleCard({ marketPrice: 999 })],
        },
      };
    },
    5_000 + PRICE_MEMORY_TTL_MS + 5,
  );
  assert.equal(calls, 2);
  assert.equal(refreshed.ok && refreshed.body.data[0].marketPrice, 999);
});

test("server payload cache evicts the oldest set", () => {
  const now = 10_000;
  for (let i = 0; i < MAX_PAYLOAD_ENTRIES + 1; i += 1) {
    writePayload(`pokemon|set-${i}||`, { data: [], meta: { total: i } }, now);
  }
  assert.equal(readCachedPayload("pokemon|set-0||", now), null);
  assert.ok(readCachedPayload(`pokemon|set-${MAX_PAYLOAD_ENTRIES}||`, now));
});

test("client set cache keeps art and prices and evicts oldest", () => {
  for (let i = 0; i < SET_CARD_CACHE_LIMIT + 1; i += 1) {
    writeSetCardCache({
      categoryId: "pokemon",
      setId: `set-${i}`,
      cards: [sampleCard({ id: `card-${i}` })],
      pricedCount: 1,
      priceSource: "pokemontcg",
      fallbackUsed: false,
      stats: null,
      cachedAt: i,
      pricesAt: i,
    });
  }
  assert.equal(readSetCardCache("pokemon", "set-0"), null);
  const newest = readSetCardCache("pokemon", `set-${SET_CARD_CACHE_LIMIT}`);
  assert.equal(newest?.cards[0].images.large, sampleCard().images.large);
  assert.equal(newest?.cards[0].marketPrice, 400);
  assert.equal("tcgplayer" in (newest?.cards[0] ?? {}), false);
});
