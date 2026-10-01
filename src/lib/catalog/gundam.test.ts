import assert from "node:assert/strict";
import test from "node:test";
import { enrichCard, formatCollectorNumberLabel, selectChaseCards, sortBySetNumber } from "../prices";
import {
  EMPTY_ENTITLEMENTS,
  hasFullAccessInCategory,
  premiumPickerCategories,
  unlockAddonState,
  unlockAllAccessState,
  unlockPremiumState,
} from "../entitlements";
import { isCheckoutEntitlementKey } from "../stripe/catalog";
import type { CardWithPrice } from "../types";
import { getCategory } from "./types";
import {
  buildGundamCards,
  isMainGundamGroup,
  parseGundamCollectorNumber,
  selectGundamGroups,
} from "./gundam";
import type { TcgcsvGroup, TcgcsvPriceRow, TcgcsvProduct } from "./tcgcsv";

function group(
  partial: Partial<TcgcsvGroup> & Pick<TcgcsvGroup, "groupId" | "name" | "abbreviation">,
): TcgcsvGroup {
  return { publishedOn: "2026-07-24T00:00:00", ...partial };
}

function product(
  partial: Partial<TcgcsvProduct> & Pick<TcgcsvProduct, "productId" | "name">,
  fields: Record<string, string>,
): TcgcsvProduct {
  return {
    extendedData: Object.entries(fields).map(([name, value]) => ({ name, value })),
    ...partial,
  };
}

test("gundam parser keeps set codes, reprints, resources, and tokens", () => {
  assert.deepEqual(parseGundamCollectorNumber("GD05-001"), {
    number: "GD05-001",
    printedTotal: 0,
  });
  assert.deepEqual(parseGundamCollectorNumber("ST11-001"), {
    number: "ST11-001",
    printedTotal: 0,
  });
  assert.deepEqual(parseGundamCollectorNumber("ST01-011"), {
    number: "ST01-011",
    printedTotal: 0,
  });
  assert.deepEqual(parseGundamCollectorNumber("EXR-009"), {
    number: "EXR-009",
    printedTotal: 0,
  });
  assert.deepEqual(parseGundamCollectorNumber("T-026"), {
    number: "T-026",
    printedTotal: 0,
  });
  assert.deepEqual(parseGundamCollectorNumber("R-001"), {
    number: "R-001",
    printedTotal: 0,
  });
  assert.equal(parseGundamCollectorNumber("001/166"), null);
  assert.equal(parseGundamCollectorNumber("GD01_b"), null);
});

test("gundam keeps boosters and starters, and hides sealed or unpriced groups", () => {
  const freedom = group({ groupId: 24699, name: "Freedom Ascension", abbreviation: "GD05" });
  const starter = group({
    groupId: 24800,
    name: "Starter Deck 11: Aquatic Assault",
    abbreviation: "ST11",
  });
  const stardust = group({
    groupId: 24804,
    name: "Stardust Trails",
    abbreviation: "GD06",
    publishedOn: "2026-10-30T00:00:00",
  });
  const box = group({
    groupId: 24767,
    name: "Deck Build Box Freedom Ascension",
    abbreviation: "SC01",
  });
  const beta = group({ groupId: 24193, name: "Edition Beta", abbreviation: "GD01_b" });
  assert.equal(isMainGundamGroup(freedom), true);
  assert.equal(isMainGundamGroup(starter), true);
  assert.equal(isMainGundamGroup(stardust), true);
  assert.equal(isMainGundamGroup(box), false);
  assert.equal(isMainGundamGroup(beta), false);

  const kept = selectGundamGroups([freedom, starter, stardust, box, beta], {
    availabilityByGroupId: new Map([
      [24699, true],
      [24800, true],
      [24804, false],
      [24767, true],
      [24193, true],
    ]),
  });
  assert.deepEqual(
    kept.map((item) => item.groupId),
    [24699, 24800],
  );
});

test("parallels stay separate, reprints keep their code, and LR++ ranks first", () => {
  const freedom = group({ groupId: 24699, name: "Freedom Ascension", abbreviation: "GD05" });
  const rows: Array<[number, string, string, string, number]> = [
    [1, "Wing Gundam Zero (EW) (LR++)", "GD05-067", "LR++", 3877.41],
    [2, "Strike Freedom Gundam (LR++)", "GD05-002", "LR++", 2622.13],
    [3, "Nu Gundam (LR++)", "GD05-017", "LR++", 1552.13],
    [4, "Sazabi (LR++)", "GD05-049", "LR++", 1272.77],
    [5, "Master Gundam (LR++)", "GD05-033", "LR++", 1135.14],
    [6, "Strike Freedom Gundam", "GD05-002", "Legend Rare", 6.93],
    [7, "Strike Freedom Gundam (LR+)", "GD05-002", "LR+", 74.71],
    [8, "Wing Gundam Zero (EW)", "GD05-067", "Legend Rare", 12],
    [9, "Suletta Mercury (C+) (SP)", "ST01-011", "C+", 20],
    [10, "EX Resource (EXR-009) (C+) (SP)", "EXR-009", "C+", 791.04],
    [11, "Plain Parallel", "GD05-010", "C+", 3],
    ...Array.from({ length: 16 }, (_, index) => [
      100 + index,
      `Filler ${index + 1}`,
      `GD05-${String(index + 80).padStart(3, "0")}`,
      "Common",
      0.05,
    ] as [number, string, string, string, number]),
  ];
  const products = rows.map(([productId, name, number, rarity]) =>
    product({ productId, name }, { Number: number, Rarity: rarity }),
  );
  const prices: TcgcsvPriceRow[] = rows.map(([productId, , , , marketPrice]) => ({
    productId,
    subTypeName: "Holofoil",
    marketPrice,
  }));

  const cards = buildGundamCards({ group: freedom, products, prices }).map(enrichCard);
  const strike = cards.filter((card) => card.number === "GD05-002");
  assert.equal(strike.length, 3);
  assert.deepEqual(
    strike.map((card) => card.rarity).sort(),
    ["LR+", "LR++", "Legend Rare"],
  );
  assert.equal(cards.find((card) => card.number === "ST01-011")?.number, "ST01-011");
  assert.equal(cards.find((card) => card.number === "EXR-009")?.number, "EXR-009");
  const labeled = cards.find((card) => card.number === "GD05-010");
  assert.equal(labeled?.name, "Plain Parallel (C+)");
  assert.equal(
    cards.filter((card) => card.name === "Wing Gundam Zero (EW) (LR++)").length,
    1,
  );

  const chase = selectChaseCards(cards, { categoryId: "gundam" });
  assert.deepEqual(
    chase.cards.slice(0, 5).map((card) => [card.number, card.rarity, card.marketPrice]),
    [
      ["GD05-067", "LR++", 3877.41],
      ["GD05-002", "LR++", 2622.13],
      ["GD05-017", "LR++", 1552.13],
      ["GD05-049", "LR++", 1272.77],
      ["GD05-033", "LR++", 1135.14],
    ],
  );

  const order = sortBySetNumber(cards).map((card) => card.number);
  assert.ok(order.indexOf("GD05-002") < order.indexOf("GD05-067"));
  assert.ok(order.lastIndexOf("GD05-067") < order.indexOf("EXR-009"));
  assert.ok(order.indexOf("EXR-009") < order.indexOf("ST01-011"));
});

test("gundam codes display without a fake set-size denominator", () => {
  const set = { printedTotal: 0, total: 197 };
  assert.equal(formatCollectorNumberLabel({ number: "GD05-067", set }), "GD05-067");
  assert.equal(formatCollectorNumberLabel({ number: "ST01-011", set }), "ST01-011");
  assert.equal(formatCollectorNumberLabel({ number: "EXR-009", set }), "EXR-009");
  assert.equal(
    formatCollectorNumberLabel({ number: "189*", set: { printedTotal: 166, total: 246 } }),
    "189*/166",
  );
  assert.equal(
    formatCollectorNumberLabel({ number: "245", set: { printedTotal: 207, total: 245 } }),
    "245/207",
  );
});

test("gundam number sort does not change a non-gundam catalog", () => {
  const cards = [
    { id: "base1-10", number: "10", name: "Ten" },
    { id: "base1-2", number: "2", name: "Two" },
  ] as CardWithPrice[];
  assert.deepEqual(
    sortBySetNumber(cards).map((card) => card.number),
    ["2", "10"],
  );
});

test("gundam is fully free and is not a premium or add-on category", () => {
  assert.equal(getCategory("gundam").free, true);
  assert.equal(getCategory("gundam").priceLabel, null);
  assert.match(getCategory("gundam").disclaimer || "", /Not affiliated with Bandai or Sunrise/);
  assert.equal(hasFullAccessInCategory(EMPTY_ENTITLEMENTS, "gundam"), true);
  assert.equal(premiumPickerCategories().includes("gundam"), false);
  assert.equal(unlockPremiumState(EMPTY_ENTITLEMENTS, "gundam").premium, false);
  assert.deepEqual(unlockAddonState(EMPTY_ENTITLEMENTS, "gundam").categories, []);
  assert.equal(unlockAllAccessState().categories.includes("gundam"), false);
  assert.equal(isCheckoutEntitlementKey("gundam"), false);
  assert.deepEqual(premiumPickerCategories(), ["pokemon", "one-piece", "mtg"]);
});
