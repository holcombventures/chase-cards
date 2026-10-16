import assert from "node:assert/strict";
import test from "node:test";
import type { SealedPriceRow, SealedProduct } from "@/lib/catalog/sealedBox";
import {
  buildSealedOffers,
  isSpecialPokemonSet,
  offerChoiceLabel,
  omittedFixedCount,
  pickDefaultOffer,
  productResultTitle,
  promoMarketFromCards,
  visibleOffers,
} from "./sealedProducts";

function product(productId: number, name: string, number?: string): SealedProduct {
  return {
    productId,
    name,
    extendedData: number ? [{ name: "Number", value: number }] : [],
  };
}

function price(productId: number, marketPrice: number | null): SealedPriceRow {
  return { productId, subTypeName: "Normal", marketPrice };
}

test("a normal Pokémon set lists the booster box and prices that exact sku", () => {
  const offers = buildSealedOffers(
    [
      product(1, "Pitch Black Booster Box"),
      product(2, "Pitch Black Booster Box Case"),
      product(3, "Pitch Black Elite Trainer Box"),
      product(4, "Pitch Black Booster Bundle"),
      product(5, "Pitch Black Booster Pack"),
      product(6, "Nami", "001"),
    ],
    [price(1, 182.12), price(2, 1109), price(3, 77.99), price(4, 40.49), price(5, 5.98)],
    { category: "pokemon", id: "me5", name: "Pitch Black" },
  );
  const visible = visibleOffers(offers);
  assert.equal(pickDefaultOffer(visible, { category: "pokemon", id: "me5", name: "Pitch Black" })?.name, "Pitch Black Booster Box");
  assert.equal(visible.find((offer) => offer.typeId === "booster-box")?.packs, 36);
  assert.equal(visible.find((offer) => offer.typeId === "booster-box")?.marketPrice, 182.12);
  assert.equal(visible.some((offer) => /case/i.test(offer.name)), false);
  assert.equal(visible.find((offer) => offer.typeId === "elite-trainer-box")?.accessories, true);
  assert.equal(
    productResultTitle("Pitch Black", visible[0], 36, 1).includes("Pitch Black · "),
    true,
  );
  const box = visible.find((offer) => offer.typeId === "booster-box");
  assert.ok(box);
  assert.equal(productResultTitle("Pitch Black", box, 36, 1), "Pitch Black · Booster Box (36 packs)");
});

test("Pokémon special sets hide booster boxes and open on a bundle or ETB", () => {
  assert.equal(isSpecialPokemonSet({ id: "sv8pt5", name: "Prismatic Evolutions" }), true);
  assert.equal(isSpecialPokemonSet({ id: "me5", name: "Pitch Black" }), false);
  const offers = buildSealedOffers(
    [
      product(1, "Prismatic Evolutions Booster Bundle"),
      product(2, "Prismatic Evolutions Elite Trainer Box"),
      product(3, "Prismatic Evolutions Pokemon Center Elite Trainer Box (Exclusive)"),
      product(4, "Prismatic Evolutions Mini Tin [Umbreon]"),
      product(5, "Prismatic Evolutions Booster Pack"),
      product(6, "Prismatic Evolutions Super-Premium Collection"),
    ],
    [price(1, 32), price(2, 65), price(3, 90), price(4, 15), price(5, 6), price(6, 120)],
    { category: "pokemon", id: "sv8pt5", name: "Prismatic Evolutions" },
  );
  assert.equal(offers.some((offer) => offer.typeId === "booster-box"), false);
  const visible = visibleOffers(offers);
  assert.equal(visible.some((offer) => /mini tin|collection/i.test(offer.name)), false);
  assert.ok(omittedFixedCount(offers) >= 2);
  const chosen = pickDefaultOffer(offers, { category: "pokemon", id: "sv8pt5", name: "Prismatic Evolutions" });
  assert.equal(chosen?.typeId, "booster-bundle");
  assert.equal(chosen?.packs, 6);
  assert.equal(visible.find((offer) => offer.typeId === "elite-trainer-box")?.packs, 9);
  assert.equal(visible.find((offer) => offer.typeId === "pokemon-center-etb")?.packs, 11);
});

test("fixed and mixed products are called out instead of given a pack EV", () => {
  const proving = buildSealedOffers(
    [product(1, "Origins - Proving Grounds Box Set"), product(2, "Origins - Proving Grounds Box Set Case")],
    [price(1, 40), price(2, 200)],
    { category: "riftbound", id: "24439", name: "Origins: Proving Grounds" },
  );
  assert.equal(proving.length, 1);
  assert.equal(proving[0].evApplies, false);
  assert.equal(proving[0].note, "EV not applicable: fixed or mixed contents");
  assert.equal(visibleOffers(proving)[0].typeId, "fixed");

  const lorcana = buildSealedOffers(
    [
      product(1, "Disney Lorcana: Attack of the Vine! Booster Box"),
      product(2, "Disney Lorcana: Attack of the Vine! Illumineer's Trove"),
      product(3, "Disney Lorcana: Attack of the Vine! Collection Starter Set - Rapunzel Edition"),
      product(4, "Disney Lorcana: Attack of the Vine! Prerelease Box"),
    ],
    [price(1, 193.77), price(2, 86), price(3, 37), price(4, 59)],
    { category: "lorcana", id: "24666", name: "Attack of the Vine!" },
  );
  const visible = visibleOffers(lorcana);
  const box = visible.find((offer) => offer.typeId === "booster-box");
  assert.equal(box?.packs, 24);
  assert.equal(
    productResultTitle("Attack of the Vine!", box!, 24, 1),
    "Attack of the Vine! · Booster Box (24 packs)",
  );
  assert.equal(visible.find((offer) => offer.typeId === "trove")?.packs, 8);
  assert.equal(visible.find((offer) => offer.typeId === "trove")?.accessories, true);
  assert.equal(visible.some((offer) => /starter|prerelease/i.test(offer.name)), false);
});

test("Premium Booster and Edition Beta use their own pack counts", () => {
  const prb = buildSealedOffers(
    [
      product(1, "Premium Booster - Booster Box"),
      product(2, "Premium Booster - Booster Box (Wave 1)"),
      product(3, "Premium Booster - Booster Pack"),
    ],
    [price(1, 80), price(2, 140), price(3, 8)],
    { category: "one-piece", id: "PRB-01", name: "Premium Booster -The Best-" },
  );
  const boxes = prb.filter((offer) => offer.typeId === "booster-box");
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].packs, 20);
  assert.equal(boxes[0].cardsPerPack, 10);
  assert.equal(boxes[0].rateTable, "one-piece-prb");
  assert.equal(pickDefaultOffer(prb, { category: "one-piece", id: "PRB-01", name: "Premium Booster" })?.marketPrice, 80);
  assert.equal(offerChoiceLabel(boxes[0], prb), boxes[0].name);

  const beta = buildSealedOffers(
    [product(1, "Gundam Card Game Edition Beta Box"), product(2, "Gundam Card Game Edition Beta Pack")],
    [price(1, 400), price(2, 30)],
    { category: "gundam", id: "24193", name: "Edition Beta" },
  );
  const box = beta.find((offer) => offer.typeId === "edition-beta-box");
  assert.equal(box?.packs, 16);
  assert.equal(box?.cardsPerPack, 9);
  assert.equal(box?.rateTable, "gundam-edition-beta");
  assert.deepEqual(box?.bonus, [{ slotId: "legend", hits: 1 }]);
  assert.equal(beta.find((offer) => offer.typeId === "edition-beta-pack")?.bonus.length, 0);
  assert.equal(
    productResultTitle("Edition Beta", box!, 16, 1),
    "Edition Beta · Edition Beta Box (16 packs)",
  );
});

test("Riftbound's sealed unit is the booster display, and a case multiplier stays in the title", () => {
  const offers = buildSealedOffers(
    [
      product(1, "Vendetta - Booster Display"),
      product(2, "Vendetta - Booster Display Case"),
      product(3, "Vendetta - Champion Deck (Jinx)"),
    ],
    [price(1, 139.71), price(2, 877), price(3, 20)],
    { category: "riftbound", id: "24698", name: "Vendetta" },
  );
  const chosen = pickDefaultOffer(offers, { category: "riftbound", id: "24698", name: "Vendetta" });
  assert.equal(chosen?.typeLabel, "Booster Display");
  assert.equal(chosen?.packs, 24);
  assert.equal(
    productResultTitle("Vendetta", chosen!, 24, 6),
    "Vendetta · Booster Display (24 packs) × 6",
  );
  assert.equal(promoMarketFromCards([{ name: "Umbreon", marketPrice: 4 }, { name: "Umbreon ex", marketPrice: 12 }], "Mini Tin [Umbreon]"), 8);
});
