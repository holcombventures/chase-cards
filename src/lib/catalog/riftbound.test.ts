import assert from "node:assert/strict";
import test from "node:test";
import { enrichCard, selectChaseCards, sortBySetNumber } from "../prices";
import {
  EMPTY_ENTITLEMENTS,
  hasFullAccessInCategory,
  premiumPickerCategories,
  unlockAddonState,
  unlockAllAccessState,
  unlockPremiumState,
} from "../entitlements";
import { isCheckoutEntitlementKey } from "../stripe/catalog";
import { getCategory } from "./types";
import {
  RIFTBOUND_MAIN_GROUP_IDS,
  buildRiftboundCards,
  isMainRiftboundGroup,
  parseRiftboundCollectorNumber,
  selectRiftboundGroups,
} from "./riftbound";
import type { TcgcsvGroup, TcgcsvPriceRow, TcgcsvProduct } from "./tcgcsv";

function group(
  partial: Partial<TcgcsvGroup> & Pick<TcgcsvGroup, "groupId" | "name" | "abbreviation">,
): TcgcsvGroup {
  return { publishedOn: "2026-07-31T00:00:00", ...partial };
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

test("riftbound parser keeps alt arts, signatures, overnumbered, and specials", () => {
  assert.deepEqual(parseRiftboundCollectorNumber("021a/166"), {
    number: "021a",
    printedTotal: 166,
  });
  assert.deepEqual(parseRiftboundCollectorNumber("189*/166"), {
    number: "189*",
    printedTotal: 166,
  });
  assert.deepEqual(parseRiftboundCollectorNumber("189/166"), {
    number: "189",
    printedTotal: 166,
  });
  assert.deepEqual(parseRiftboundCollectorNumber("SP1/006"), {
    number: "SP1",
    printedTotal: 6,
  });
  assert.deepEqual(parseRiftboundCollectorNumber("R04"), {
    number: "R04",
    printedTotal: 0,
  });
  assert.deepEqual(parseRiftboundCollectorNumber("R04a"), {
    number: "R04a",
    printedTotal: 0,
  });
  assert.deepEqual(parseRiftboundCollectorNumber("T05 // T06"), {
    number: "T05 // T06",
    printedTotal: 0,
  });
  assert.equal(parseRiftboundCollectorNumber("not a card"), null);
  assert.equal(parseRiftboundCollectorNumber("12/0"), null);
});

test("riftbound main sets are the allow-list, and unpriced previews stay hidden", () => {
  const vendetta = group({ groupId: 24698, name: "Vendetta", abbreviation: "VEN" });
  const radiance = group({
    groupId: 24819,
    name: "Radiance",
    abbreviation: "RAD",
    publishedOn: "2026-10-23T00:00:00",
  });
  const promo = group({
    groupId: 24343,
    name: "Riftbound Promotional Cards",
    abbreviation: "PR",
  });
  assert.equal(isMainRiftboundGroup(vendetta), true);
  assert.equal(isMainRiftboundGroup(radiance), true);
  assert.equal(isMainRiftboundGroup(promo), false);
  assert.equal(RIFTBOUND_MAIN_GROUP_IDS.has(24344), true);
  assert.equal(RIFTBOUND_MAIN_GROUP_IDS.has(24502), false);

  const hidden = selectRiftboundGroups([vendetta, radiance, promo], {
    availabilityByGroupId: new Map([
      [24698, true],
      [24819, false],
      [24343, true],
    ]),
  });
  assert.deepEqual(
    hidden.map((item) => item.groupId),
    [24698],
  );

  const pricedPreview = selectRiftboundGroups([radiance], {
    now: new Date("2026-10-01T00:00:00.000Z"),
    availabilityByGroupId: new Map([[24819, true]]),
  });
  assert.deepEqual(
    pricedPreview.map((item) => item.groupId),
    [24819],
  );
});

test("vendetta-style numbers stay in the set and signatures rank first", () => {
  const vendetta = group({ groupId: 24698, name: "Vendetta", abbreviation: "VEN" });
  const rows: Array<[number, string, string, string, number]> = [
    [1, "Akali, Rogue Assassin (Signature)", "189*/166", "Showcase", 3229.71],
    [2, "Zed, Master of Shadows (Signature)", "191*/166", "Showcase", 1352.67],
    [3, "Jayce, Defender of Tomorrow (Signature)", "194*/166", "Showcase", 1218.96],
    [4, "Kennen, Heart of the Tempest (Signature)", "197*/166", "Showcase", 1152.22],
    [5, "Mel, Soul's Reflection (Signature)", "195*/166", "Showcase", 1124.31],
    [6, "Akali, Rogue Assassin (Overnumbered)", "189/166", "Showcase", 578.56],
    [7, "Akali, Deadly Weapon (Alternate Art)", "021a/166", "Showcase", 11.68],
    [8, "Ahri, Inquisitive", "SP1/006", "Showcase", 72.92],
    [9, "Body Rune", "R04", "Common", 0.1],
    [10, "Calm Rune", "R04a", "Common", 0.2],
    [11, "Shadow Clone // Tentacle", "T05 // T06", "Common", 0.1],
    [12, "Filler", "010/166", "Common", 0.05],
    ...Array.from({ length: 16 }, (_, index) => [
      100 + index,
      `Filler ${index + 2}`,
      `${String(index + 11).padStart(3, "0")}/166`,
      "Common",
      0.04,
    ] as [number, string, string, string, number]),
  ];
  const products = rows.map(([productId, name, number, rarity]) =>
    product({ productId, name }, { Number: number, Rarity: rarity }),
  );
  const prices: TcgcsvPriceRow[] = rows.map(([productId, , , , marketPrice]) => ({
    productId,
    subTypeName: "Foil",
    marketPrice,
  }));
  const cards = buildRiftboundCards({ group: vendetta, products, prices }).map(enrichCard);
  assert.equal(cards.length, rows.length);
  assert.equal(cards.find((card) => card.name.startsWith("Akali, Deadly"))?.number, "021a");
  assert.equal(cards.find((card) => card.number === "189*")?.marketPrice, 3229.71);
  assert.equal(cards.find((card) => card.number === "SP1")?.set.printedTotal, 6);

  const chase = selectChaseCards(cards, { categoryId: "riftbound" });
  assert.deepEqual(
    chase.cards.slice(0, 5).map((card) => [card.number, card.marketPrice]),
    [
      ["189*", 3229.71],
      ["191*", 1352.67],
      ["194*", 1218.96],
      ["197*", 1152.22],
      ["195*", 1124.31],
    ],
  );

  const order = sortBySetNumber(cards).map((card) => card.number);
  assert.ok(order.indexOf("010") < order.indexOf("021a"));
  assert.ok(order.indexOf("021a") < order.indexOf("189"));
  assert.ok(order.indexOf("189") < order.indexOf("189*"));
  assert.ok(order.indexOf("189*") < order.indexOf("R04"));
  assert.ok(order.indexOf("R04") < order.indexOf("R04a"));
  assert.ok(order.indexOf("R04a") < order.indexOf("SP1"));
});

test("riftbound is fully free and is not a premium or add-on category", () => {
  assert.equal(getCategory("riftbound").free, true);
  assert.equal(getCategory("riftbound").priceLabel, null);
  assert.match(getCategory("riftbound").disclaimer || "", /Legal Jibber Jabber/);
  assert.equal((getCategory("riftbound").disclaimer || "").includes("League of Legends"), false);
  assert.equal(hasFullAccessInCategory(EMPTY_ENTITLEMENTS, "riftbound"), true);
  assert.equal(premiumPickerCategories().includes("riftbound"), false);
  assert.equal(unlockPremiumState(EMPTY_ENTITLEMENTS, "riftbound").premium, false);
  assert.deepEqual(unlockAddonState(EMPTY_ENTITLEMENTS, "riftbound").categories, []);
  assert.equal(unlockAllAccessState().categories.includes("riftbound"), false);
  assert.equal(isCheckoutEntitlementKey("riftbound"), false);
});
