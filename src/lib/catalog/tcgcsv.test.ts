import assert from "node:assert/strict";
import test from "node:test";
import { enrichCard } from "../prices";
import {
  PRICED_SINGLES_FLOOR,
  buildTcgcsvCards,
  compareCollectorNumbers,
  countPricedSingles,
  selectTcgcsvGroups,
  type TcgcsvGroup,
  type TcgcsvPriceRow,
  type TcgcsvProduct,
} from "./tcgcsv";
import { buildLorcanaCards, parseCollectorNumber } from "./lorcana";

function group(
  partial: Partial<TcgcsvGroup> & Pick<TcgcsvGroup, "groupId" | "name" | "abbreviation">,
): TcgcsvGroup {
  return { publishedOn: "2026-07-17T00:00:00", ...partial };
}

function product(
  partial: Partial<TcgcsvProduct> & Pick<TcgcsvProduct, "productId" | "name">,
  fields: Record<string, string>,
): TcgcsvProduct {
  return {
    imageUrl: `https://tcgplayer-cdn.tcgplayer.com/product/${partial.productId}_200w.jpg`,
    extendedData: Object.entries(fields).map(([name, value]) => ({ name, value })),
    ...partial,
  };
}

const attack = group({
  groupId: 24666,
  name: "Attack of the Vine!",
  abbreviation: "13",
});

test("priced-single floor ignores sealed product and unpriced preview singles", () => {
  const products = [
    product({ productId: 1, name: "Booster Box" }, { Description: "Sealed" }),
    product({ productId: 2, name: "Preview Card" }, { Number: "001/166", Rarity: "Rare" }),
    product({ productId: 3, name: "Priced Card" }, { Number: "002/166", Rarity: "Rare" }),
  ];
  const unpriced: TcgcsvPriceRow[] = [
    { productId: 1, subTypeName: "Normal", marketPrice: 90 },
    { productId: 2, subTypeName: "Foil", marketPrice: null },
  ];
  assert.equal(countPricedSingles(products, unpriced, parseCollectorNumber), 0);
  assert.equal(PRICED_SINGLES_FLOOR, 1);

  const priced: TcgcsvPriceRow[] = [
    ...unpriced,
    { productId: 3, subTypeName: "Foil", marketPrice: 4.5 },
  ];
  assert.equal(countPricedSingles(products, priced, parseCollectorNumber), 1);
});

test("availability map drops a main set that is not listable", () => {
  const groups = [
    group({ groupId: 1, name: "Listed", abbreviation: "1" }),
    group({ groupId: 2, name: "Hidden", abbreviation: "2" }),
    group({ groupId: 3, name: "Promo", abbreviation: "PR" }),
  ];
  const kept = selectTcgcsvGroups(groups, {
    now: new Date("2026-09-25T12:00:00.000Z"),
    isMainGroup: (item) => /^\d+$/.test(item.abbreviation),
    requireReleased: true,
    availabilityByGroupId: new Map([
      [1, true],
      [2, false],
    ]),
  });
  assert.deepEqual(
    kept.map((item) => item.groupId),
    [1],
  );
});

test("all-digit collector numbers still sort 2 before 10", () => {
  assert.ok(compareCollectorNumbers("2", "10") < 0);
  assert.ok(compareCollectorNumbers("10", "2") > 0);
  assert.equal(compareCollectorNumbers("10", "10"), 0);
  assert.ok(compareCollectorNumbers("021a", "10") > 0);
  assert.ok(compareCollectorNumbers("189", "189*") < 0);
  assert.ok(compareCollectorNumbers("R01", "SP1") < 0);
});

test("shared builder matches the Lorcana foil merge", () => {
  const products = [
    product(
      { productId: 702684, name: "Carl Fredricksen - Loving Husband" },
      { Number: "74/207", Rarity: "Uncommon" },
    ),
    product(
      { productId: 702683, name: "Carl Fredricksen - Loving Husband (Foil)" },
      { Number: "74/207", Rarity: "Uncommon" },
    ),
  ];
  const prices: TcgcsvPriceRow[] = [
    { productId: 702684, subTypeName: "Normal", marketPrice: 0.06 },
    { productId: 702683, subTypeName: "Cold Foil", marketPrice: 6.05 },
  ];
  const input = { group: attack, products, prices };
  const shared = buildTcgcsvCards(input, {
    categoryId: "lorcana",
    parseCollectorNumber,
    mergeFoilSkus: true,
  });
  const direct = buildLorcanaCards(input);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].id, direct[0].id);
  assert.equal(shared[0].name, "Carl Fredricksen - Loving Husband");
  assert.equal(enrichCard(shared[0]).marketPrice, 6.05);
  assert.equal(shared[0].images.large.includes("702683_in_1000x1000.jpg"), true);
});
