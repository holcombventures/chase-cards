import assert from "node:assert/strict";
import test from "node:test";
import {
  BOX_EV_DEFAULTS,
  boxEvVerdict,
  boxPriceRatio,
  classifyCard,
  cloneBoxDefaults,
  modelBoxEv,
  type EvCard,
} from "./boxEv";
import { TOOL_CATEGORY_IDS } from "./categories";

function card(partial: Partial<EvCard> & Pick<EvCard, "id" | "marketPrice">): EvCard {
  return {
    name: partial.name ?? partial.id,
    rarity: partial.rarity ?? "Rare",
    number: partial.number ?? "1",
    ...partial,
  };
}

test("box verdict uses 85% and 110% of modeled EV", () => {
  assert.equal(boxEvVerdict(85, 100, 1), "Good buy");
  assert.equal(boxEvVerdict(85.01, 100, 1), "Fair");
  assert.equal(boxEvVerdict(110, 100, 1), "Fair");
  assert.equal(boxEvVerdict(110.01, 100, 1), "Overpriced");
  assert.equal(boxEvVerdict(0, 100, 1), "Good buy");
  assert.equal(boxEvVerdict(50, 0, 0), "Need prices");
  assert.equal(boxEvVerdict(50, 10, 0), "Need prices");
  assert.equal(boxEvVerdict(Number.NaN, 100, 1), "Need prices");
  assert.equal(boxPriceRatio(85, 100), 0.85);
  assert.equal(boxPriceRatio(10, 0), null);
});

test("modeled EV is the median price times hits per pack times packs", () => {
  const cards = [
    card({ id: "a", rarity: "Common", marketPrice: 1 }),
    card({ id: "b", rarity: "Common", marketPrice: 3 }),
    card({ id: "c", rarity: "Illustration Rare", marketPrice: 40 }),
    card({ id: "d", rarity: "Illustration Rare", marketPrice: null }),
  ];
  const model = modelBoxEv({
    cards,
    packsPerBox: 10,
    slots: [
      { id: "common", label: "Common", hitsPerPack: 2 },
      { id: "illustration-rare", label: "Illustration Rare", hitsPerPack: 0.5 },
      { id: "other", label: "Other", hitsPerPack: 4 },
    ],
    classify: (item) => classifyCard("pokemon", item),
  });
  const common = model.rows.find((row) => row.id === "common");
  const illustration = model.rows.find((row) => row.id === "illustration-rare");
  assert.equal(common?.pricedCount, 2);
  assert.equal(common?.typicalPrice, 2);
  assert.equal(common?.hitsPerBox, 20);
  assert.equal(common?.slotEv, 40);
  assert.equal(illustration?.pricedCount, 1);
  assert.equal(illustration?.cardCount, 2);
  assert.equal(illustration?.slotEv, 200);
  assert.equal(model.modeledEv, 240);
  assert.equal(model.pricedCards, 3);
});

test("one extreme price does not set the typical price of a slot", () => {
  const cards = [
    card({ id: "a", rarity: "Common", marketPrice: 1 }),
    card({ id: "b", rarity: "Common", marketPrice: 1 }),
    card({ id: "c", rarity: "Common", marketPrice: 1 }),
    card({ id: "d", rarity: "Common", marketPrice: 1 }),
    card({ id: "e", rarity: "Common", marketPrice: 1000 }),
  ];
  const model = modelBoxEv({
    cards,
    packsPerBox: 10,
    slots: [{ id: "common", label: "Common", hitsPerPack: 2 }],
    classify: (item) => classifyCard("pokemon", item),
  });
  const common = model.rows.find((row) => row.id === "common");
  assert.equal(common?.typicalPrice, 1);
  assert.equal(common?.slotEv, 20);
  assert.equal(model.modeledEv, 20);
});

test("cited hit counts stay at one copy of the published rate", () => {
  function hits(category: keyof typeof BOX_EV_DEFAULTS, slotId: string): number {
    const defaults = BOX_EV_DEFAULTS[category];
    const slot = defaults.slots.find((item) => item.id === slotId);
    assert.ok(slot);
    return slot.hitsPerPack * defaults.packsPerBox;
  }
  assert.ok(Math.abs(hits("pokemon", "special-illustration-rare") - 36 / 80) < 1e-9);
  assert.ok(Math.abs(hits("pokemon", "hyper-rare") - 36 / 1081) < 0.002);
  assert.ok(Math.abs(hits("lorcana", "common") - 6 * 24) < 1e-9);
  assert.ok(Math.abs(hits("lorcana", "enchanted") - 24 / 96) < 1e-9);
  assert.ok(Math.abs(hits("lorcana", "iconic") - 24 / 1600) < 1e-9);
  assert.ok(Math.abs(hits("one-piece", "leader") - 8) < 1e-9);
  assert.ok(Math.abs(hits("one-piece", "super-rare") - 7) < 1e-9);
  assert.ok(Math.abs(hits("one-piece", "alt") - 2.25) < 1e-9);
  assert.ok(Math.abs(hits("one-piece", "case-hit") - 1 / 12) < 1e-9);
  assert.ok(Math.abs(hits("riftbound", "common") - 7 * 24) < 1e-9);
  assert.ok(Math.abs(hits("riftbound", "epic") - 0.25 * 24) < 1e-9);
  assert.ok(Math.abs(hits("riftbound", "alt-art") - 2) < 1e-9);
  assert.ok(Math.abs(hits("riftbound", "overnumbered") - 1 / 3) < 1e-9);
  assert.ok(Math.abs(hits("riftbound", "signature") - 24 / 720) < 1e-9);
  assert.ok(Math.abs(hits("gundam", "common") - 6 * 24) < 1e-9);
  assert.ok(Math.abs(hits("gundam", "legend") - 8) < 1e-9);
  assert.ok(Math.abs(hits("gundam", "sp") - 0.2) < 1e-9);
  assert.ok(Math.abs(hits("gundam", "lr-plus-plus") - 1 / 12) < 1e-9);
});

test("a zero hit rate and a zero pack count add nothing", () => {
  const cards = [card({ id: "a", rarity: "Common", marketPrice: 8 })];
  const zeroHits = modelBoxEv({
    cards,
    packsPerBox: 36,
    slots: [{ id: "common", label: "Common", hitsPerPack: 0 }],
    classify: (item) => classifyCard("pokemon", item),
  });
  assert.equal(zeroHits.modeledEv, 0);
  const zeroPacks = modelBoxEv({
    cards,
    packsPerBox: 0,
    slots: [{ id: "common", label: "Common", hitsPerPack: 4 }],
    classify: (item) => classifyCard("pokemon", item),
  });
  assert.equal(zeroPacks.modeledEv, 0);
  assert.equal(boxEvVerdict(100, zeroPacks.modeledEv, zeroPacks.pricedCards), "Need prices");
});

test("rarity buckets stay inside each game's editable slots", () => {
  const samples: Record<(typeof TOOL_CATEGORY_IDS)[number], EvCard[]> = {
    pokemon: [
      card({ id: "p1", rarity: "Special Illustration Rare", marketPrice: 1 }),
      card({ id: "p2", rarity: "Illustration Rare", marketPrice: 1 }),
      card({ id: "p3", name: "Prime Catcher", rarity: "ACE SPEC Rare", marketPrice: 1 }),
      card({ id: "p4", rarity: "Double Rare", marketPrice: 1 }),
      card({ id: "p5", rarity: "Common", marketPrice: 1 }),
    ],
    "one-piece": [
      card({ id: "o1", rarity: "SEC", marketPrice: 1 }),
      card({ id: "o2", rarity: "SR", marketPrice: 1 }),
      card({ id: "o3", rarity: "L", marketPrice: 1 }),
      card({ id: "o4", rarity: "C", marketPrice: 1 }),
      card({ id: "o5", rarity: "SP", name: "Shanks", marketPrice: 1 }),
      card({ id: "o6", rarity: "R", name: "Nami (Parallel)", marketPrice: 1 }),
      card({ id: "o7", rarity: "SR", name: "Shanks (Manga)", marketPrice: 1 }),
    ],
    lorcana: [
      card({ id: "l1", rarity: "Enchanted", marketPrice: 1 }),
      card({ id: "l2", rarity: "Iconic", marketPrice: 1 }),
      card({ id: "l3", rarity: "Super Rare", marketPrice: 1 }),
      card({ id: "l4", rarity: "Common", marketPrice: 1 }),
    ],
    riftbound: [
      card({ id: "r1", name: "Akali (Signature)", number: "189*/166", rarity: "Showcase", marketPrice: 1 }),
      card({ id: "r2", name: "Ahri", number: "010/166", rarity: "Epic", marketPrice: 1 }),
      card({ id: "r3", name: "Body Rune", number: "R04", rarity: "Common", marketPrice: 1 }),
    ],
    gundam: [
      card({ id: "g1", rarity: "LR++", marketPrice: 1 }),
      card({ id: "g2", rarity: "Legend Rare", marketPrice: 1 }),
      card({ id: "g3", rarity: "C+", marketPrice: 1 }),
      card({ id: "g4", rarity: "Common", marketPrice: 1 }),
      card({ id: "g5", rarity: "C+", name: "EX Resource (C+) (SP)", marketPrice: 1 }),
    ],
  };

  for (const category of TOOL_CATEGORY_IDS) {
    const ids = new Set(BOX_EV_DEFAULTS[category].slots.map((slot) => slot.id));
    for (const sample of samples[category]) {
      const bucket = classifyCard(category, sample);
      assert.equal(ids.has(bucket), true, `${category} ${sample.rarity} → ${bucket}`);
    }
    const defaults = cloneBoxDefaults(category);
    defaults.slots[0].hitsPerPack = 99;
    assert.notEqual(defaults.slots[0].hitsPerPack, BOX_EV_DEFAULTS[category].slots[0].hitsPerPack);
  }

  assert.equal(classifyCard("pokemon", card({ id: "sir", rarity: "Special Illustration Rare", marketPrice: 1 })), "special-illustration-rare");
  assert.equal(classifyCard("riftbound", card({ id: "sig", name: "Zed (Signature)", number: "1*", rarity: "Showcase", marketPrice: 1 })), "signature");
  assert.equal(classifyCard("riftbound", card({ id: "over", name: "Akali (Overnumbered)", number: "189", rarity: "Showcase", marketPrice: 1 })), "overnumbered");
  assert.equal(classifyCard("gundam", card({ id: "lr", rarity: "LR+", marketPrice: 1 })), "lr-plus");
  assert.equal(classifyCard("gundam", card({ id: "sp", rarity: "C+", name: "EX Resource (C+) (SP)", marketPrice: 1 })), "sp");
  assert.equal(classifyCard("one-piece", card({ id: "c", rarity: "C", name: "Rare Animal", marketPrice: 1 })), "common");
  assert.equal(classifyCard("one-piece", card({ id: "aa", rarity: "R", name: "Nami (Parallel)", marketPrice: 1 })), "alt");
  assert.equal(classifyCard("one-piece", card({ id: "manga", rarity: "SEC", name: "Shanks (Manga)", marketPrice: 1 })), "case-hit");
  assert.equal(classifyCard("one-piece", card({ id: "top", rarity: "C", name: "Alvida (Box Topper)", marketPrice: 1 })), "other");
});

test("chase printings are not given a common slot's pull rate", () => {
  const lorcana = BOX_EV_DEFAULTS.lorcana;
  const iconic = lorcana.slots.find((slot) => slot.id === "iconic");
  assert.ok(iconic);
  assert.ok(iconic.hitsPerPack * lorcana.packsPerBox < 0.05, "iconic stays under one per 20 boxes");

  const cards = [card({ id: "icon", rarity: "Iconic", name: "Belle & Beast (Iconic)", marketPrice: 1800 })];
  const model = modelBoxEv({
    cards,
    packsPerBox: lorcana.packsPerBox,
    slots: lorcana.slots,
    classify: (item) => classifyCard("lorcana", item),
  });
  const iconicEv = model.rows.find((row) => row.id === "iconic")?.slotEv ?? 0;
  assert.ok(iconicEv < 40, `iconic slot EV was ${iconicEv}`);

  const piece = BOX_EV_DEFAULTS["one-piece"];
  const caseHit = piece.slots.find((slot) => slot.id === "case-hit");
  assert.ok(caseHit);
  assert.ok(caseHit.hitsPerPack * piece.packsPerBox <= 1 / 12 + 1e-9);

  const rift = BOX_EV_DEFAULTS.riftbound;
  const signature = rift.slots.find((slot) => slot.id === "signature");
  assert.ok(signature);
  assert.ok(signature.hitsPerPack * rift.packsPerBox < 0.05);

  const gundam = BOX_EV_DEFAULTS.gundam;
  const grail = gundam.slots.find((slot) => slot.id === "lr-plus-plus");
  assert.ok(grail);
  assert.ok(grail.hitsPerPack * gundam.packsPerBox <= 1 / 12 + 1e-9);
  const sp = gundam.slots.find((slot) => slot.id === "sp");
  assert.ok(sp && sp.hitsPerPack * gundam.packsPerBox < 0.5);
});
