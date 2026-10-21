import assert from "node:assert/strict";
import test from "node:test";
import {
  isStandardBoosterBoxName,
  matchTcgcsvGroup,
  selectSealedBoosterBox,
  type SealedGroup,
  type SealedPriceRow,
  type SealedProduct,
} from "./sealedBox";

function product(productId: number, name: string, number?: string): SealedProduct {
  return {
    productId,
    name,
    extendedData: number ? [{ name: "Number", value: number }] : [],
  };
}

test("sealed quote is the cheaper standard booster box, not the case or the pack", () => {
  const products: SealedProduct[] = [
    product(1, "Romance Dawn - Booster Box (Wave 1 - Blue)"),
    product(2, "Romance Dawn - Booster Box Case (Wave 2 - White)"),
    product(3, "Romance Dawn - Booster Box (Wave 2 - White)"),
    product(4, "Romance Dawn - Booster Pack"),
    product(5, "Pitch Black Half Booster Boxes"),
    product(6, "Pitch Black Booster Box"),
    product(7, "Nami", "OP01-016"),
  ];
  const prices: SealedPriceRow[] = [
    { productId: 1, subTypeName: "Normal", marketPrice: 4636.13 },
    { productId: 2, subTypeName: "Normal", marketPrice: 100 },
    { productId: 3, subTypeName: "Normal", marketPrice: 1376.11 },
    { productId: 4, subTypeName: "Normal", marketPrice: 66.53 },
    { productId: 5, subTypeName: "Normal", marketPrice: 40 },
    { productId: 6, subTypeName: "Normal", marketPrice: 182.12 },
    { productId: 6, subTypeName: "Unlimited", marketPrice: 1 },
    { productId: 7, subTypeName: "Normal", marketPrice: 5000 },
  ];
  const romance = selectSealedBoosterBox(products.slice(0, 5), prices);
  assert.equal(romance?.productId, 3);
  assert.equal(romance?.marketPrice, 1376.11);

  const pitch = selectSealedBoosterBox(
    products.filter((item) => item.productId === 6 || item.productId === 7),
    prices,
  );
  assert.equal(pitch?.marketPrice, 182.12);
  assert.equal(isStandardBoosterBoxName("Vendetta - Booster Display Case"), false);
  assert.equal(isStandardBoosterBoxName("Vendetta - Booster Display"), true);
});

test("a booster display is the sealed unit when the set has no booster box", () => {
  const quote = selectSealedBoosterBox(
    [
      product(1, "Vendetta - Booster Pack"),
      product(2, "Vendetta - Booster Display Case"),
      product(3, "Vendetta - Booster Display"),
      product(4, "Vendetta - Showdown Decks: Zed vs Shen Display"),
    ],
    [
      { productId: 1, subTypeName: "Normal", marketPrice: 7.47 },
      { productId: 2, subTypeName: "Normal", marketPrice: 877.52 },
      { productId: 3, subTypeName: "Normal", marketPrice: 139.71 },
      { productId: 4, subTypeName: "Normal", marketPrice: 48.36 },
    ],
  );
  assert.equal(quote?.name, "Vendetta - Booster Display");
  assert.equal(quote?.marketPrice, 139.71);
});

test("set ids match the TCGCSV group without grabbing a release-event list", () => {
  const groups: SealedGroup[] = [
    { groupId: 3188, name: "Romance Dawn", abbreviation: "OP01" },
    { groupId: 24736, name: "The World's Strongest Warriors", abbreviation: "OP17" },
    { groupId: 24775, name: "The World's Strongest Warriors Release Event Cards", abbreviation: "OP17 RE" },
    { groupId: 24688, name: "ME05: Pitch Black", abbreviation: "PBL" },
    { groupId: 24666, name: "Attack of the Vine!", abbreviation: "13" },
    { groupId: 24698, name: "Vendetta", abbreviation: "VEN" },
  ];
  assert.equal(matchTcgcsvGroup(groups, { id: "OP-01", name: "Romance Dawn" })?.groupId, 3188);
  assert.equal(matchTcgcsvGroup(groups, { id: "OP-17", name: "The World's Strongest Warriors" })?.groupId, 24736);
  assert.equal(matchTcgcsvGroup(groups, { id: "me5", name: "Pitch Black" })?.groupId, 24688);
  assert.equal(matchTcgcsvGroup(groups, { id: "me5" })?.groupId, 24688);
  assert.equal(matchTcgcsvGroup(groups, { id: "24666", name: "Attack of the Vine!" })?.groupId, 24666);
  assert.equal(matchTcgcsvGroup(groups, { id: "24698", name: "Vendetta" })?.groupId, 24698);
});
