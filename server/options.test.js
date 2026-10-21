// Options overlay: pricing, strikes, expiries, volatility, and the backtest engine.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bsPrice, bsDelta, normCdf, normInv, strikeForDelta, expiryFor, realizedVolSeries, buildStructure, priceStructure,
  structureRisk, runBacktest, normalizeStrategy, strategySpec, defaultStrategy, canonicalJson, generatePine, costCheck,
} from "../packages/core/src/index.js";

const close = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) <= tol, `${a} ≉ ${b}`);

test("Black-Scholes matches textbook values and put-call parity", () => {
  close(bsPrice("call", 100, 100, 1, 0.05, 0.2), 10.4506);
  close(bsPrice("put", 100, 100, 1, 0.05, 0.2), 5.5735);
  for (const [S, K, T, r, v] of [[580, 600, 30 / 365, 0.04, 0.18], [12, 10, 0.1, 0.03, 0.6], [150, 140, 2, 0.05, 0.35]]) {
    close(bsPrice("call", S, K, T, r, v) - bsPrice("put", S, K, T, r, v), S - K * Math.exp(-r * T), 1e-6);
  }
  assert.equal(bsPrice("call", 110, 100, 0, 0.05, 0.2), 10); // expired: intrinsic
  assert.equal(bsPrice("put", 110, 100, 0, 0.05, 0.2), 0);
});

test("normal CDF and its inverse agree", () => {
  for (const p of [0.001, 0.025, 0.2, 0.5, 0.8, 0.975, 0.999]) close(normCdf(normInv(p)), p, 2e-7);
});

test("strike by delta gives that delta, for calls and puts", () => {
  const K = strikeForDelta("call", 580, 30 / 365, 0.04, 0.18, 0.3);
  close(bsDelta("call", 580, K, 30 / 365, 0.04, 0.18), 0.3, 1e-6);
  const P = strikeForDelta("put", 580, 30 / 365, 0.04, 0.18, 0.25);
  close(bsDelta("put", 580, P, 30 / 365, 0.04, 0.18), -0.25, 1e-6);
  assert.ok(K > 580 && P < 580);
});

test("expiry is 16:00 ET on the first Friday at least DTE days out", () => {
  const wed = Date.UTC(2026, 9, 21, 14) / 1000; // Wed 21 Oct 2026
  assert.equal(new Date(expiryFor(wed, 30) * 1000).toISOString(), "2026-11-20T21:00:00.000Z"); // Fri, EST (16:00 = 21:00Z)
  assert.equal(new Date(expiryFor(wed, 2) * 1000).toISOString(), "2026-10-23T20:00:00.000Z"); // Fri, EDT (16:00 = 20:00Z)
  const friMorning = Date.UTC(2026, 9, 23, 14) / 1000;
  assert.equal(new Date(expiryFor(friMorning, 0.5) * 1000).toISOString(), "2026-10-23T20:00:00.000Z"); // same day, still before the close
});

// Weekday daily bars from Monday 5 Jan 2026, stamped 05:00 UTC (midnight ET)
function dailyBars(closes) {
  const out = [];
  let t = Date.UTC(2026, 0, 5, 5) / 1000;
  for (const c of closes) {
    while ([0, 6].includes(new Date(t * 1000).getUTCDay())) t += 86400;
    out.push({ time: t, open: c, high: c * 1.002, low: c * 0.998, close: c, volume: 1 });
    t += 86400;
  }
  return out;
}

test("realized volatility only uses earlier days", () => {
  const closes = Array.from({ length: 60 }, (_, i) => 100 * (1 + 0.01 * Math.sin(i * 1.7)));
  const a = realizedVolSeries(dailyBars(closes), 20, "1d");
  const changed = closes.slice(); changed[40] = 150;
  const b = realizedVolSeries(dailyBars(changed), 20, "1d");
  assert.equal(a[40], b[40]); // a bar's own close never feeds its volatility
  assert.notEqual(a[41], b[41]);
  assert.equal(a[3], null); // not enough history yet
  assert.ok(a[30] > 0.05 && a[30] < 0.5);
});

// Choppy for 40 days (gives a volatility), crosses 105 on day 40, then climbs to ~140
const CHOP = Array.from({ length: 40 }, (_, i) => 100 * (1 + 0.012 * Math.sin(i * 2.1)));
const RALLY = Array.from({ length: 40 }, (_, i) => 106 + i);
const cross = (op, v) => ({ left: { type: "price", params: { source: "close" } }, op, right: { type: "value", params: { value: v } } });
const optStrategy = (options = {}, extra = {}) => normalizeStrategy({
  ...defaultStrategy(), market: "stocks", symbol: "TEST", interval: "1d", instrument: "options",
  entry: { logic: "all", conditions: [cross("crossesAbove", 105)] }, exit: { logic: "any", conditions: [] },
  risk: { initialCapital: 5000 }, options: { takeProfitPct: 0, stopLossPct: 0, ...options }, ...extra,
});

test("a bull call spread held to expiry settles at its full width when the stock ends above both strikes", () => {
  const r = runBacktest(dailyBars([...CHOP, ...RALLY]), optStrategy({ structure: "spread", spreadWidth: 5, delta: 0.5, dte: 21 }));
  const t = r.trades[0];
  assert.equal(t.reason, "expiry");
  assert.deepEqual(t.legs.map((l) => [l.type, l.side]), [["call", 1], ["call", -1]]);
  assert.equal(t.legs[1].strike - t.legs[0].strike, 5);
  close(t.exitPrice, 5, 1e-9); // settled at intrinsic: the full $5 width, no bid-ask at expiry
  close(t.pnl, (5 - t.entryPrice) * 100 * t.contracts - 0.65 * 2 * t.contracts, 1e-6); // entry fees only
  assert.ok(t.maxLoss >= t.cost - 1e-9);
});

test("spreads never lose more than the premium, and long puts profit from a drop", () => {
  const down = Array.from({ length: 40 }, (_, i) => 94 - i * 0.8);
  const r = runBacktest(dailyBars([...CHOP, ...down]), optStrategy({ structure: "single", dte: 30 }, {
    direction: "short", entry: { logic: "all", conditions: [cross("crossesBelow", 95)] },
  }));
  assert.equal(r.trades[0].legs[0].type, "put");
  assert.ok(r.trades[0].pnl > 0, JSON.stringify(r.trades[0]));

  const chop = Array.from({ length: 200 }, (_, i) => 100 * (1 + 0.05 * Math.sin(i * 0.9)));
  const s = runBacktest(dailyBars(chop), optStrategy({ structure: "spread", spreadWidth: 2, takeProfitPct: 50, stopLossPct: 50 }, {
    entry: { logic: "all", conditions: [cross("crossesAbove", 100)] }, exit: { logic: "any", conditions: [cross("crossesBelow", 97)] },
  }));
  assert.ok(s.trades.length >= 5);
  for (const t of s.trades) {
    assert.ok(t.exitPrice >= 0 && t.exitPrice <= 2 + 1e-9, `exit ${t.exitPrice}`);
    assert.ok(t.pnl >= -t.cost - 1e-9, `pnl ${t.pnl} cost ${t.cost}`);
  }
});

test("entries a small account can't afford are skipped and counted", () => {
  const r = runBacktest(dailyBars([...CHOP, ...RALLY]), optStrategy({ structure: "single" }, { risk: { initialCapital: 100 } }));
  assert.equal(r.trades.length, 0);
  assert.equal(r.metrics.tooExpensive, 1);
  assert.ok(r.options.cheapestSkipped > 25); // one contract costs more than 25% of $100
  assert.equal(r.options.preview.affordableContracts, 0);
});

test("preview shows the structure, max loss/profit and breakeven", () => {
  const r = runBacktest(dailyBars([...CHOP, ...RALLY]), optStrategy({ structure: "spread", spreadWidth: 2 }));
  const p = r.options.preview;
  assert.equal(p.legs.length, 2);
  close(p.maxLoss, p.premium * 100 + 0.65 * 2 * 2, 1e-9);
  close(p.maxProfit, (2 - p.premium) * 100 - 0.65 * 2 * 2, 1e-9);
  close(p.breakeven, p.legs[0].strike + p.premium, 1e-9);
  assert.equal(p.payoff.length, 61);
  const st = buildStructure({ S: 100, ts: Date.UTC(2026, 9, 21, 14) / 1000, iv: 0.3, direction: "long", options: { structure: "single" } });
  const priced = priceStructure(st, { S: 100, ts: Date.UTC(2026, 9, 21, 14) / 1000, iv: 0.3, options: {}, opening: true });
  assert.ok(priced.fill > priced.mid); // pay the ask when buying
  assert.equal(structureRisk(st, priced.fill).maxProfit, null); // long call: unlimited
});

test("costs show up in the cost check", () => {
  const chop = Array.from({ length: 200 }, (_, i) => 100 * (1 + 0.05 * Math.sin(i * 0.9)));
  const r = runBacktest(dailyBars(chop), optStrategy({ structure: "spread", spreadWidth: 1, feePerContract: 0.65 }, {
    entry: { logic: "all", conditions: [cross("crossesAbove", 100)] }, exit: { logic: "any", conditions: [cross("crossesBelow", 97)] },
  }));
  assert.ok(r.metrics.roundTripCostPct > 0);
  assert.ok(r.metrics.feesPaid > 0 && r.metrics.slippagePaid > 0);
  assert.notEqual(costCheck(r.metrics).level, undefined);
});

test("share strategies keep their rules hash; options settings are part of an options strategy's rules", () => {
  const shares = normalizeStrategy(defaultStrategy());
  assert.equal("instrument" in strategySpec(shares), false);
  assert.equal(canonicalJson(strategySpec({ ...defaultStrategy(), instrument: "shares" })), canonicalJson(strategySpec(defaultStrategy())));
  const o = strategySpec(optStrategy());
  assert.equal(o.instrument, "options");
  assert.equal(o.options.structure, "spread");
  assert.notEqual(canonicalJson(strategySpec(optStrategy({ dte: 45 }))), canonicalJson(o));
});

test("options need stocks; Pine export explains the overlay", () => {
  assert.throws(() => runBacktest(dailyBars([...CHOP, ...RALLY]), optStrategy({}, { market: "crypto" })), /US stocks and ETFs/);
  assert.match(generatePine(optStrategy()), /can't trade options/);
  assert.equal(generatePine(normalizeStrategy(defaultStrategy())).includes("options"), false);
});
