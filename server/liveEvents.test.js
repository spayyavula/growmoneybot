// Follower trade alerts: event detection (core) + "what's new since last time" (server).
// Run with `npm test` (node:test, no extra dependencies).
import { test } from "node:test";
import assert from "node:assert/strict";
import { livePerformance } from "../packages/core/src/verify.js";
import { initialWatermark, selectNewEvents, eventNotification, isLiveDue } from "./liveEvents.js";

const H = 3600;
const T0 = 1_760_000_400 - (1_760_000_400 % H); // an hour boundary

const candlesFrom = (closes) => closes.map((c, i) => ({
  time: T0 + i * H, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1,
}));

// Enter when the close crosses above 100, exit when it crosses back below
const strategy = (extra = {}) => ({
  market: "crypto", symbol: "BTCUSDT", interval: "1h", bars: 50, direction: "long",
  entry: { logic: "all", conditions: [{ left: { type: "price", params: { source: "close" } }, op: "crossesAbove", right: { type: "value", params: { value: 100 } } }] },
  exit: { logic: "any", conditions: [{ left: { type: "price", params: { source: "close" } }, op: "crossesBelow", right: { type: "value", params: { value: 100 } } }] },
  risk: { initialCapital: 10000, positionSizePct: 50, feePct: 0 },
  ...extra,
});

//            0  1  2  3  4  5  6  7  8  9  10   11   12   13  14  15
const CLOSES = [90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 105, 106, 107, 95, 94, 93];
const SINCE = T0 + 5 * H;

/** Replay hourly refreshes, each seeing one more completed bar; return the alerts sent at each. */
function replay(spec, closes, fromBar) {
  let live = {}; // the stored algo.live
  const sent = [];
  for (let n = fromBar; n <= closes.length; n++) {
    const candles = candlesFrom(closes.slice(0, n));
    const lp = livePerformance(spec, candles, SINCE);
    const watermark = initialWatermark(live, SINCE, H);
    const nowSec = candles[candles.length - 1].time + H + 120; // two minutes after the bar closed
    const sel = selectNewEvents(lp.events, { watermark, nowSec, stepSec: H });
    sent.push({ bars: n, events: sel.fresh });
    live = { notifiedThrough: sel.watermark, updatedAt: new Date(nowSec * 1000) };
  }
  return sent;
}

test("signal on the last closed bar is reported as pending, then not again once filled", () => {
  const sent = replay(strategy(), CLOSES, 8);
  const all = sent.flatMap((s) => s.events.map((e) => ({ at: s.bars, ...e })));

  assert.deepEqual(all.map((e) => [e.at, e.type, e.action, e.pending]), [
    [11, "entry", "buy", true], // bar 10 closed above 100 → alert immediately, fills at bar 11's open
    [14, "exit", "sell", true], // bar 13 closed below 100 → exit alert
  ]);
  assert.equal(all[0].key, T0 + 10 * H);
  assert.equal(all[0].price, 105);
  assert.equal(all[1].key, T0 + 13 * H);
});

test("every refresh after the last event sends nothing (no duplicates)", () => {
  const sent = replay(strategy(), [...CLOSES, 92, 91, 90], 8);
  assert.equal(sent.flatMap((s) => s.events).length, 2);
  const after = sent.filter((s) => s.bars > 14);
  assert.equal(after.length, 5);
  assert.ok(after.every((s) => s.events.length === 0), JSON.stringify(after));
});

test("short algorithms sell to enter and buy to exit", () => {
  const sent = replay(strategy({ direction: "short" }), CLOSES, 8).flatMap((s) => s.events);
  assert.deepEqual(sent.map((e) => [e.type, e.action]), [["entry", "sell"], ["exit", "buy"]]);
});

test("a stop loss alerts on the bar it was hit, with the P&L", () => {
  //                                            entry signal at 10, fill at 11 (106), bar 12 falls through the stop
  const closes = [90, 90, 90, 90, 90, 90, 90, 90, 90, 90, 105, 106, 100.5, 101, 102];
  const spec = strategy({ risk: { initialCapital: 10000, positionSizePct: 50, feePct: 0, stopLossPct: 5 } });
  const sent = replay(spec, closes, 8).flatMap((s) => s.events);
  const stop = sent.find((e) => e.reason === "stop loss");
  assert.ok(stop, JSON.stringify(sent));
  assert.equal(stop.key, T0 + 12 * H);
  assert.equal(stop.pending, false);
  assert.equal(stop.action, "sell");
  assert.ok(stop.pnlPct < 0);
});

test("trades before the publish date never alert", () => {
  const candles = candlesFrom(CLOSES);
  const lp = livePerformance(strategy(), candles, T0 + 12 * H); // published after the entry signal
  const { fresh } = selectNewEvents(lp.events, { watermark: T0 + 12 * H - 1, nowSec: T0 + 16 * H, stepSec: H, maxAgeSec: 1e9 });
  assert.deepEqual(fresh, []);
});

test("stale events move the watermark but aren't sent", () => {
  const events = [{ key: 1000 }, { key: 90_000 }];
  const r = selectNewEvents(events, { watermark: 0, nowSec: 100_000, stepSec: H });
  assert.deepEqual(r.fresh.map((e) => e.key), [90_000]);
  assert.equal(r.watermark, 90_000);
});

test("initial watermark: existing value, already-tracked algorithm, new or republished", () => {
  assert.equal(initialWatermark({ notifiedThrough: 123 }, 0, H), 123);
  const updatedAt = new Date((T0 + 10 * H + 600) * 1000);
  assert.equal(initialWatermark({ updatedAt }, 0, H), T0 + 9 * H + 600);
  assert.equal(initialWatermark({ since: new Date(), started: false }, SINCE, H), SINCE - 1);
  assert.equal(initialWatermark(undefined, SINCE, H), SINCE - 1);
});

test("notification text", () => {
  const algo = { name: "Momentum v2", symbol: "BTCUSDT", interval: "1h" };
  const entry = eventNotification(algo, { type: "entry", action: "buy", pending: true, price: 67210.5 });
  assert.equal(entry.title, "BUY · BTCUSDT — Momentum v2");
  assert.match(entry.body, /^Entry signal on the 1h close at 67210\.5\. The algorithm enters at the next open\./);
  assert.match(entry.body, /Not investment advice\.$/);

  const stop = eventNotification(algo, { type: "exit", action: "sell", pending: false, price: 64000, reason: "stop loss", pnlPct: -4.8 });
  assert.match(stop.body, /^Stop loss hit at 64000 \(-4\.80%\)\./);
});

// ---- When the 15-minute job refreshes an algorithm ----------------------

const at = (sec) => new Date(sec * 1000);
const M = 60;

test("refresh is due only once the next bar has closed", () => {
  const D = 86400;
  const last = T0; // newest completed daily bar opened at T0, closed at T0 + 1d
  const live = { lastBarTime: last, updatedAt: at(last + D + 2 * M) };
  assert.equal(isLiveDue(live, D, last + D + 17 * M), false); // mid-day: no new bar can exist
  assert.equal(isLiveDue(live, D, last + 2 * D - M), false);
  assert.equal(isLiveDue(live, D, last + 2 * D + 2 * M), true); // first run after the next close
});

test("1h algorithm is picked up by the first run after each close", () => {
  const live = { lastBarTime: T0, updatedAt: at(T0 + H + 2 * M) };
  assert.equal(isLiveDue(live, H, T0 + H + 17 * M), false);
  assert.equal(isLiveDue(live, H, T0 + H + 47 * M), false);
  assert.equal(isLiveDue(live, H, T0 + 2 * H + 2 * M), true);
});

test("missing bar (market closed): every ~15 min for an hour, then hourly", () => {
  const nextClose = T0 + 2 * H;
  const live = { lastBarTime: T0, updatedAt: at(nextClose + 2 * M) }; // looked, bar wasn't there
  assert.equal(isLiveDue(live, H, nextClose + 10 * M), false);
  assert.equal(isLiveDue(live, H, nextClose + 17 * M - 4), true); // run jitter of a few seconds still counts
  const later = { lastBarTime: T0, updatedAt: at(nextClose + 2 * H) };
  assert.equal(isLiveDue(later, H, nextClose + 2 * H + 30 * M), false);
  assert.equal(isLiveDue(later, H, nextClose + 3 * H), true);
});

test("never refreshed, saved before lastBarTime existed, or last refresh failed", () => {
  assert.equal(isLiveDue(undefined, H, T0), true);
  assert.equal(isLiveDue({ since: at(T0), started: false }, H, T0), true);
  assert.equal(isLiveDue({ updatedAt: at(T0) }, H, T0 + M), true);
  const failed = { lastBarTime: T0, updatedAt: at(T0 + 2 * H), error: "timeout" };
  assert.equal(isLiveDue(failed, H, T0 + 2 * H + 10 * M), false);
  assert.equal(isLiveDue(failed, H, T0 + 2 * H + 15 * M), true);
});
