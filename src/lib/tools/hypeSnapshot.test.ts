import assert from "node:assert/strict";
import test from "node:test";
import { indexIsFresh, jobsForSets, wrapCursor, MTG_SNAPSHOT_MAX } from "./hypeSnapshot";

const NOW = Date.parse("2026-10-16T00:00:00Z");

test("snapshot jobs keep every non-magic set and only recent magic sets", () => {
  const pokemon = jobsForSets(
    "pokemon",
    [
      { id: "me5", releaseDate: "2025-01-01" },
      { id: "base1", releaseDate: "1999-01-09" },
    ],
    NOW,
  );
  assert.deepEqual(pokemon.map((job) => job.setId), ["me5", "base1"]);

  const mtg = jobsForSets(
    "mtg",
    [
      { id: "old", releaseDate: "2020-01-01" },
      { id: "new", releaseDate: "2026-09-01" },
      { id: "soon", releaseDate: "2026-11-01" },
      { id: "blank", releaseDate: "" },
    ],
    NOW,
  );
  assert.deepEqual(
    mtg.map((job) => job.setId),
    ["soon", "new"],
  );
  const many = jobsForSets(
    "mtg",
    Array.from({ length: MTG_SNAPSHOT_MAX + 5 }, (_, index) => ({
      id: `s${index}`,
      releaseDate: "2026-10-01",
    })),
    NOW,
  );
  assert.equal(many.length, MTG_SNAPSHOT_MAX);
});

test("snapshot cursor wraps and a stale index is rebuilt", () => {
  assert.equal(wrapCursor(4, 3), 3);
  assert.equal(wrapCursor(4, 4), 0);
  assert.equal(wrapCursor(4, -1), 3);
  assert.equal(indexIsFresh({ v: 1, builtAt: NOW, jobs: [{ category: "pokemon", setId: "me5" }] }, NOW), true);
  assert.equal(
    indexIsFresh({ v: 1, builtAt: NOW - 13 * 60 * 60 * 1000, jobs: [{ category: "pokemon", setId: "me5" }] }, NOW),
    false,
  );
});
