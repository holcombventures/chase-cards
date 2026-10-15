import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_CHECKLIST,
  DEFAULT_GRADE_MULTIPLIERS,
  gradingRoi,
  lowestChecklistScore,
  pricedGradeForScore,
  type ChecklistScores,
} from "./gradingRoi";

function scores(overrides: Partial<ChecklistScores> = {}): ChecklistScores {
  return { ...DEFAULT_CHECKLIST, ...overrides };
}

test("the lowest checklist score is the likely grade", () => {
  assert.equal(
    lowestChecklistScore(scores({ centering: 10, corners: 8, edges: 10, surface: 9 })),
    8,
  );
  assert.equal(
    lowestChecklistScore(scores({ centering: 9, corners: 10, edges: 6, surface: 10 })),
    6,
  );
  assert.equal(lowestChecklistScore(scores()), 10);
  assert.equal(pricedGradeForScore(10), 10);
  assert.equal(pricedGradeForScore(9.5), 9);
  assert.equal(pricedGradeForScore(8), 8);
  assert.equal(pricedGradeForScore(7.9), "below");
});

test("worth grading needs $25 of uplift and profit of 40% of fees plus shipping", () => {
  const multipliers = { ...DEFAULT_GRADE_MULTIPLIERS, 10: 2 };
  const worth = gradingRoi({
    rawPrice: 100,
    scores: scores(),
    multipliers,
    fee: 40,
    shipping: 10,
  });
  assert.ok(worth);
  assert.equal(worth.slabValue, 200);
  assert.equal(worth.uplift, 100);
  assert.equal(worth.costs, 50);
  assert.equal(worth.profit, 50);
  assert.equal(worth.verdict, "Worth grading");

  const thinUplift = gradingRoi({
    rawPrice: 100,
    scores: scores(),
    multipliers: { ...multipliers, 10: 1.24 },
    fee: 5,
    shipping: 5,
  });
  assert.equal(thinUplift?.uplift, 24);
  assert.equal(thinUplift?.verdict, "Sell raw");

  const exactUplift = gradingRoi({
    rawPrice: 100,
    scores: scores(),
    multipliers: { ...multipliers, 10: 1.25 },
    fee: 5,
    shipping: 5,
  });
  assert.equal(exactUplift?.uplift, 25);
  assert.equal(exactUplift?.profit, 15);
  assert.equal(exactUplift?.verdict, "Worth grading");

  const thinProfit = gradingRoi({
    rawPrice: 100,
    scores: scores(),
    multipliers,
    fee: 60,
    shipping: 20,
  });
  assert.equal(thinProfit?.uplift, 100);
  assert.equal(thinProfit?.profit, 20);
  assert.equal(thinProfit?.verdict, "Sell raw");

  const exactProfitRatio = gradingRoi({
    rawPrice: 100,
    scores: scores(),
    multipliers,
    fee: 50,
    shipping: 21.428571,
  });
  assert.ok(exactProfitRatio);
  assert.ok(exactProfitRatio.profit + 1e-6 >= 0.4 * exactProfitRatio.costs);
  assert.equal(exactProfitRatio.verdict, "Worth grading");
});

test("a single weak trait pulls the multiplier down", () => {
  const result = gradingRoi({
    rawPrice: 50,
    scores: scores({ surface: 6 }),
    multipliers: DEFAULT_GRADE_MULTIPLIERS,
    fee: 25,
    shipping: 18,
  });
  assert.equal(result?.likelyGrade, 6);
  assert.equal(result?.pricedGrade, "below");
  assert.equal(result?.multiplier, 0.8);
  assert.equal(result?.slabValue, 40);
  assert.equal(result?.verdict, "Sell raw");
});

test("a missing raw price does not invent a verdict", () => {
  assert.equal(
    gradingRoi({
      rawPrice: Number.NaN,
      scores: scores(),
      multipliers: DEFAULT_GRADE_MULTIPLIERS,
      fee: 25,
      shipping: 18,
    }),
    null,
  );
});
