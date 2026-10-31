import { test } from "node:test";
import assert from "node:assert/strict";
import { pickJoke, wheelRotation, segmentAt } from "./randomizer.js";
import { JOKES, CATEGORIES, LANGUAGES } from "./jokes.js";

test("every language has at least one joke per category", () => {
  for (const { id: lang } of LANGUAGES) {
    for (const { id: cat } of CATEGORIES) {
      assert.ok(JOKES[lang].some((j) => j.cat === cat), `${lang}/${cat} is empty`);
    }
  }
});

test("all jokes reference a known category", () => {
  const ids = new Set(CATEGORIES.map((c) => c.id));
  for (const lang of Object.keys(JOKES)) {
    for (const j of JOKES[lang]) assert.ok(ids.has(j.cat), `${lang}: unknown cat ${j.cat}`);
  }
});

test("wheelRotation lands on the requested segment for every index and jitter", () => {
  const n = CATEGORIES.length;
  for (let start of [0, 37, 359, 1800, 2765.5]) {
    for (let i = 0; i < n; i++) {
      for (const jitter of [-0.5, 0, 0.5]) {
        const r = wheelRotation(start, i, n, { jitter });
        assert.equal(segmentAt(r, n), i, `start=${start} i=${i} jitter=${jitter}`);
        assert.ok(r - start >= 5 * 360, "spins at least minTurns forward");
      }
    }
  }
});

test("pickJoke avoids seen jokes until the bucket is exhausted", () => {
  const seen = new Set();
  const bucketSize = JOKES.en.filter((j) => j.cat === "tech").length;
  for (let k = 0; k < bucketSize; k++) {
    const { joke, resetSeen } = pickJoke(JOKES, "en", "tech", seen);
    assert.equal(resetSeen, false);
    assert.ok(!seen.has(joke.id));
    seen.add(joke.id);
  }
  const { resetSeen } = pickJoke(JOKES, "en", "tech", seen);
  assert.equal(resetSeen, true);
});
