// Pure randomizer helpers — no React, so they can be unit tested with node --test.

/** Random integer in [0, n). `rand` is injectable for tests. */
export const randInt = (n, rand = Math.random) => Math.floor(rand() * n);

/**
 * Pick a joke in `lang` + `cat`, avoiding ids in `seen`.
 * When every joke in the bucket has been seen, the bucket resets (returns resetSeen: true).
 * Joke ids are `${lang}:${index}` into JOKES[lang].
 */
export function pickJoke(jokes, lang, cat, seen = new Set(), rand = Math.random) {
  const bucket = jokes[lang]
    .map((j, i) => ({ ...j, id: `${lang}:${i}`, lang }))
    .filter((j) => j.cat === cat);
  if (bucket.length === 0) return { joke: null, resetSeen: false };
  const fresh = bucket.filter((j) => !seen.has(j.id));
  const pool = fresh.length ? fresh : bucket;
  return { joke: pool[randInt(pool.length, rand)], resetSeen: fresh.length === 0 };
}

/**
 * Wheel rotation (degrees, clockwise) that lands segment `index` under a pointer at 12 o'clock.
 * Segment i spans [i*seg, (i+1)*seg) measured clockwise from the top of the unrotated wheel.
 * Always spins forward at least `minTurns` full turns from `current`.
 * `jitter` in [-0.5, 0.5] nudges the stop point within the segment so it doesn't look canned.
 */
export function wheelRotation(current, index, count, { minTurns = 5, jitter = 0 } = {}) {
  const seg = 360 / count;
  const target = (((360 - (index + 0.5 + jitter * 0.8) * seg) % 360) + 360) % 360;
  const now = ((current % 360) + 360) % 360;
  const delta = (target - now + 360) % 360;
  return current + minTurns * 360 + delta;
}

/** Which segment sits under the top pointer for a given rotation. Inverse of wheelRotation. */
export function segmentAt(rotation, count) {
  const seg = 360 / count;
  const angle = (((360 - (rotation % 360)) % 360) + 360) % 360;
  return Math.floor(angle / seg) % count;
}
