import assert from "node:assert/strict";
import test from "node:test";
import { enrichCard, selectChaseCards } from "../prices";
import {
  EMPTY_ENTITLEMENTS,
  hasFullAccessInCategory,
  premiumPickerCategories,
  unlockAddonState,
  unlockAllAccessState,
  unlockPremiumState,
} from "../entitlements";
import {
  buildLorcanaCards,
  displayCardName,
  isMainNumberedGroup,
  isReleasedGroup,
  productIsSingle,
  selectLorcanaGroups,
  type TcgcsvGroup,
  type TcgcsvPriceRow,
  type TcgcsvProduct,
} from "./lorcana";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function group(
  partial: Partial<TcgcsvGroup> & Pick<TcgcsvGroup, "groupId" | "name" | "abbreviation">,
): TcgcsvGroup {
  return {
    publishedOn: "2026-07-17T00:00:00",
    ...partial,
  };
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
  publishedOn: "2026-07-17T00:00:00",
});

test("main numbered sets stay; promos, quests, and unreleased groups drop", () => {
  const groups = [
    attack,
    group({
      groupId: 24617,
      name: "Wilds Unknown",
      abbreviation: "12",
      publishedOn: "2026-05-08T00:00:00",
    }),
    group({
      groupId: 24740,
      name: "Hyperia City",
      abbreviation: "14",
      publishedOn: "2026-10-16T00:00:00",
    }),
    group({
      groupId: 24734,
      name: "Illumineer's Quest: The Great Hunny Rescue",
      abbreviation: "Q3",
      publishedOn: "2026-10-02T00:00:00",
    }),
    group({
      groupId: 23305,
      name: "Disney100 Promos",
      abbreviation: "D100",
      publishedOn: "2023-12-01T00:00:00",
    }),
    group({
      groupId: 23234,
      name: "Disney Lorcana Promo Cards",
      abbreviation: "DLPC",
      publishedOn: "2023-07-01T00:00:00",
    }),
    group({
      groupId: 17690,
      name: "D23 Promos",
      abbreviation: "D23",
      publishedOn: "2022-09-11T00:00:00",
    }),
  ];

  assert.equal(isMainNumberedGroup(attack), true);
  assert.equal(isMainNumberedGroup(groups[4]), false);
  assert.equal(isReleasedGroup(groups[2], NOW), false);

  const singles = new Map<number, boolean>([
    [24666, true],
    [24617, true],
    [24740, false],
  ]);
  const kept = selectLorcanaGroups(groups, { now: NOW, singlesByGroupId: singles });
  assert.deepEqual(
    kept.map((item) => item.groupId),
    [24666, 24617],
  );
});

test("sealed products are not singles", () => {
  const booster = product(
    { productId: 1, name: "Disney Lorcana: Attack of the Vine! Booster Box" },
    { Description: "Sealed box" },
  );
  const card = product(
    { productId: 2, name: "Mike Wazowski - Well-Rounded Entertainer" },
    { Number: "21/207", Rarity: "Common" },
  );
  assert.equal(productIsSingle(booster), false);
  assert.equal(productIsSingle(card), true);
  assert.equal(displayCardName("Carl Fredricksen - Loving Husband (Foil)"), "Carl Fredricksen - Loving Husband");
});

test("prices join on productId and the highest market subtype wins", () => {
  const products = [
    product(
      { productId: 702661, name: "Belle & Beast - Certain as the Sun" },
      { Number: "132/207", Rarity: "Rare" },
    ),
    product(
      { productId: 1, name: "Disney Lorcana: Attack of the Vine! Booster Box" },
      {},
    ),
  ];
  const prices: TcgcsvPriceRow[] = [
    { productId: 702661, subTypeName: "Normal", marketPrice: 0.43 },
    { productId: 702661, subTypeName: "Cold Foil", marketPrice: 2.44 },
    { productId: 1, subTypeName: "Normal", marketPrice: 120 },
  ];

  const cards = buildLorcanaCards({ group: attack, products, prices });
  assert.equal(cards.length, 1);
  const enriched = enrichCard(cards[0]);
  assert.equal(enriched.name, "Belle & Beast - Certain as the Sun");
  assert.equal(enriched.number, "132");
  assert.equal(enriched.marketPrice, 2.44);
  assert.equal(enriched.priceVariant, "Cold Foil");
  assert.equal(enriched.set.printedTotal, 207);
  assert.equal(enriched.images.small.includes("702661_200w.jpg"), true);
  assert.equal(enriched.images.large.includes("702661_in_1000x1000.jpg"), true);
});

test("a separate foil SKU merges by collector number and keeps the higher price", () => {
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

  const cards = buildLorcanaCards({ group: attack, products, prices });
  assert.equal(cards.length, 1);
  const enriched = enrichCard(cards[0]);
  assert.equal(enriched.id, "lorcana-24666-702684");
  assert.equal(enriched.name, "Carl Fredricksen - Loving Husband");
  assert.equal(enriched.rarity, "Uncommon");
  assert.equal(enriched.marketPrice, 6.05);
  assert.equal(enriched.priceVariant, "Cold Foil");
  assert.equal(enriched.images.large.includes("702683_in_1000x1000.jpg"), true);
});

test("iconic and enchanted printings stay separate and rank by market price", () => {
  const products = [
    product(
      { productId: 702667, name: "Belle & Beast - Certain as the Sun (Iconic)" },
      { Number: "245/207", Rarity: "Iconic" },
    ),
    product(
      { productId: 702666, name: "Lilo & Stitch - Fun-Loving Friends (Iconic)" },
      { Number: "244/207", Rarity: "Iconic" },
    ),
    product(
      { productId: 704725, name: "Winnie the Pooh & Piglet - Hunny Mages (Enchanted)" },
      { Number: "234/207", Rarity: "Enchanted" },
    ),
    product(
      { productId: 702661, name: "Belle & Beast - Certain as the Sun" },
      { Number: "132/207", Rarity: "Rare" },
    ),
    product(
      { productId: 690200, name: "Mike Wazowski - Well-Rounded Entertainer" },
      { Number: "21/207", Rarity: "Common" },
    ),
  ];
  const filler = Array.from({ length: 12 }, (_, index) =>
    product(
      { productId: 800000 + index, name: `Filler Common ${index + 1}` },
      { Number: `${index + 1}/207`, Rarity: "Common" },
    ),
  );
  const prices: TcgcsvPriceRow[] = [
    { productId: 702667, subTypeName: "Holofoil", marketPrice: 2008.2 },
    { productId: 702666, subTypeName: "Holofoil", marketPrice: 1629.34 },
    { productId: 704725, subTypeName: "Holofoil", marketPrice: 830.17 },
    { productId: 702661, subTypeName: "Cold Foil", marketPrice: 2.44 },
    { productId: 702661, subTypeName: "Normal", marketPrice: 0.43 },
    { productId: 690200, subTypeName: "Normal", marketPrice: null },
    ...filler.map((card) => ({
      productId: card.productId,
      subTypeName: "Normal",
      marketPrice: 0.1,
    })),
  ];

  const cards = buildLorcanaCards({
    group: attack,
    products: [...products, ...filler],
    prices,
  }).map(enrichCard);
  assert.equal(cards.length, 17);
  const mike = cards.find((card) => card.number === "21");
  assert.equal(mike?.marketPrice, null);

  const chase = selectChaseCards(cards, { categoryId: "lorcana" });
  assert.equal(chase.mode, "priced");
  assert.deepEqual(
    chase.cards.slice(0, 3).map((card) => [card.name, card.number, card.marketPrice]),
    [
      ["Belle & Beast - Certain as the Sun (Iconic)", "245", 2008.2],
      ["Lilo & Stitch - Fun-Loving Friends (Iconic)", "244", 1629.34],
      ["Winnie the Pooh & Piglet - Hunny Mages (Enchanted)", "234", 830.17],
    ],
  );
  assert.equal(cards[0].set.total, 17);
  assert.equal(cards[0].set.printedTotal, 207);
});

test("lorcana is fully free and is not a premium or add-on category", () => {
  assert.equal(hasFullAccessInCategory(EMPTY_ENTITLEMENTS, "lorcana"), true);
  assert.equal(hasFullAccessInCategory(EMPTY_ENTITLEMENTS, "pokemon"), false);
  assert.equal(hasFullAccessInCategory(EMPTY_ENTITLEMENTS, "mtg"), false);
  assert.equal(premiumPickerCategories().includes("lorcana"), false);
  assert.deepEqual(premiumPickerCategories(), ["pokemon", "one-piece", "mtg"]);

  const premium = unlockPremiumState(EMPTY_ENTITLEMENTS, "lorcana");
  assert.equal(premium.premium, false);
  assert.equal(premium.premiumCategory, null);

  const addon = unlockAddonState(EMPTY_ENTITLEMENTS, "lorcana");
  assert.deepEqual(addon.categories, []);

  const allAccess = unlockAllAccessState();
  assert.equal(allAccess.categories.includes("lorcana"), false);
  assert.equal(allAccess.categories.includes("pokemon"), true);
  assert.equal(allAccess.categories.includes("mtg"), true);
});
