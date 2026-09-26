import assert from "node:assert/strict";
import { test } from "node:test";
import type { PokemonSet } from "./types";
import {
  DEFAULT_SET_BY_CATEGORY,
  pickDefaultSetId,
  resolveSetSelection,
} from "./defaultSet";

function set(id: string, releaseDate: string, name = id): PokemonSet {
  return {
    id,
    name,
    series: "Test",
    printedTotal: 100,
    total: 100,
    releaseDate,
  };
}

const newestFirst = [
  set("me55", "2026/09/16", "30th Celebration: Classic Collection"),
  set("me5", "2026/07/17", "Pitch Black"),
  set("me4", "2026/05/01", "Chaos Rising"),
];

test("pokemon default is the Pitch Black set id", () => {
  assert.equal(DEFAULT_SET_BY_CATEGORY.pokemon, "me5");
  assert.equal(DEFAULT_SET_BY_CATEGORY["one-piece"], undefined);
  assert.equal(DEFAULT_SET_BY_CATEGORY.mtg, undefined);
});

test("pokemon selects Pitch Black even when a newer set is listed first", () => {
  const sets = newestFirst.map((entry) => ({ ...entry }));
  assert.equal(pickDefaultSetId(sets, "pokemon"), "me5");
  assert.deepEqual(
    sets.map((entry) => entry.id),
    ["me55", "me5", "me4"],
  );
});

test("pokemon falls back to the newest stable set when the pin is missing", () => {
  const sets = [
    set("brand-new", "2099/01/01"),
    set("me55", "1999/01/09"),
    set("base1", "1999/01/01"),
  ];
  assert.equal(pickDefaultSetId(sets, "pokemon"), "me55");
});

test("one-piece and mtg keep the newest-stable default", () => {
  const sets = [
    set("op15", "1999/06/01", "A Newer Stable Set"),
    set("me5", "2026/07/17", "Pitch Black"),
  ];
  assert.equal(pickDefaultSetId(sets, "one-piece"), "op15");
  assert.equal(pickDefaultSetId(sets, "mtg"), "op15");
  assert.equal(pickDefaultSetId(sets), "op15");
});

test("falls back to the first set when none are 3 days old", () => {
  const sets = [set("future-a", "2099/01/02"), set("future-b", "2099/01/01")];
  assert.equal(pickDefaultSetId(sets, "pokemon"), "future-a");
  assert.equal(pickDefaultSetId(sets, "one-piece"), "future-a");
});

test("empty catalog yields no set id", () => {
  assert.equal(pickDefaultSetId([], "pokemon"), "");
  assert.equal(resolveSetSelection("", [], "pokemon"), "");
});

test("an existing selection overrides the category default", () => {
  assert.equal(resolveSetSelection("sv8", newestFirst, "pokemon"), "sv8");
  assert.equal(resolveSetSelection("", newestFirst, "pokemon"), "me5");
  assert.equal(resolveSetSelection("op01", newestFirst, "one-piece"), "op01");
});
