// Small-account mode: slippage, cost check, cash-account settlement, presets, marketplace fit.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runBacktest, strategySpec, normalizeStrategy, defaultStrategy, TEMPLATES, canonicalJson,
  costCheck, tradingDay, applySmallAccountPreset, smallAccountFit, SMALL_ACCOUNT_PRESETS, generatePine,
} from "../packages/core/src/index.js";

const cross = (op) => ({ left: { type: "price", params: { source: "close" } }, op, right: { type: "value", params: { value: 100 } } });
const strategy = (risk = {}, extra = {}) => normalizeStrategy({
  market: "stocks", symbol: "SPY", interval: "15m", bars: 500, direction: "long",
  entry: { logic: "all", conditions: [cross("crossesAbove")] },
  exit: { logic: "any", conditions: [cross("crossesBelow")] },
  risk: { initialCapital: 500, positionSizePct: 95, feePct: 0, ...risk },
  ...extra,
});

// 15-minute bars for regular US sessions, starting Monday 2026-10-19 09:30 ET (13:30 UTC).
// Each day: up-cross at bar 1, down at 3, up at 5, down at 7 → two round trips per day.
const DAY = [90, 105, 106, 95, 96, 105, 106, 95, 94, ...Array(17).fill(94)];
function sessions(days) {
  const out = [];
  for (let d = 0; d < days; d++) {
    const open = Date.UTC(2026, 9, 19 + d, 13, 30) / 1000;
    DAY.forEach((c, i) => out.push({ time: open + i * 900, open: c, high: c + 1, low: c - 1, close: c, volume: 1 }));
  }
  return out;
}

// Risk settings as every strategy had them before small-account mode
const LEGACY_RISK = { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 0, takeProfitPct: 0 };

test("rules saved before small-account mode hash exactly as before", () => {
  for (const t of TEMPLATES) {
    const s = { ...t.build(), risk: { ...LEGACY_RISK, stopLossPct: t.build().risk.stopLossPct } };
    const spec = strategySpec(s);
    assert.deepEqual(Object.keys(spec.risk), ["initialCapital", "positionSizePct", "feePct", "stopLossPct", "takeProfitPct"]);
    assert.equal("account" in spec, false);
    assert.equal(canonicalJson(strategySpec({ ...s, risk: { ...s.risk, slippagePct: 0 } })), canonicalJson(spec));
    // a cash/margin choice never changes the rules
    assert.equal(canonicalJson(strategySpec({ ...s, account: "cash" })), canonicalJson(spec));
  }
});

test("new strategies start from the $500 low-fee crypto preset", () => {
  const preset = SMALL_ACCOUNT_PRESETS.find((p) => p.key === "crypto-low").risk;
  for (const t of TEMPLATES) {
    const s = normalizeStrategy(t.build());
    assert.equal(s.market, "crypto");
    for (const k of Object.keys(preset)) assert.equal(s.risk[k], preset[k], `${t.name} ${k}`);
  }
  assert.deepEqual([TEMPLATES[1].build().risk.stopLossPct, TEMPLATES[3].build().risk.stopLossPct], [5, 8]); // templates keep their stops
  assert.equal(normalizeStrategy({ ...defaultStrategy(), risk: { initialCapital: "" } }).risk.initialCapital, 500); // cleared field
});

test("zero slippage leaves every trade unchanged", () => {
  const bars = sessions(2);
  const a = runBacktest(bars, strategy());
  const b = runBacktest(bars, strategy({ slippagePct: 0 }));
  assert.deepEqual(a.trades, b.trades);
  assert.equal(a.metrics.slippagePaid, 0);
});

test("slippage worsens market fills; take profit (a limit order) fills at the target", () => {
  const bars = sessions(1);
  const r = runBacktest(bars, strategy({ slippagePct: 0.5 }));
  const t = r.trades[0];
  assert.equal(t.entryPrice, 106 * 1.005); // filled at bar 2's open, 0.5% worse
  assert.equal(t.exitPrice, 96 * 0.995); // signal exit at bar 4's open, 0.5% worse
  assert.ok(Math.abs(t.movePct - ((96 - 106) / 106) * 100) < 1e-9); // move is measured before costs
  assert.ok(r.metrics.slippagePaid > 0);

  const spiky = bars.map((b, i) => (i === 3 ? { ...b, high: 110 } : b)); // reaches the target the bar after the fill
  const tp = runBacktest(spiky, strategy({ slippagePct: 0.5, takeProfitPct: 0.5 }));
  const hit = tp.trades.find((x) => x.reason === "take profit");
  assert.ok(hit, JSON.stringify(tp.trades));
  assert.ok(Math.abs(hit.exitPrice - hit.entryPrice * 1.005) < 1e-9);
});

test("cost check: negative, thin, ok, too few trades", () => {
  assert.equal(costCheck({ totalTrades: 20, avgMovePct: 0.2, roundTripCostPct: 0.3 }).level, "negative");
  assert.equal(costCheck({ totalTrades: 20, avgMovePct: 0.45, roundTripCostPct: 0.3 }).level, "thin");
  const ok = costCheck({ totalTrades: 20, avgMovePct: 0.9, roundTripCostPct: 0.3 });
  assert.equal(ok.level, "ok");
  assert.ok(Math.abs(ok.ratio - 3) < 1e-9);
  assert.equal(costCheck({ totalTrades: 2, avgMovePct: 5, roundTripCostPct: 0.3 }).level, "none");
  const r = runBacktest(sessions(3), strategy({ feePct: 0.1, slippagePct: 0.05 }));
  assert.ok(Math.abs(r.metrics.roundTripCostPct - 0.3) < 1e-12);
  assert.ok(r.metrics.feesPaid > 0);
});

test("cash account: a same-day re-buy with unsettled proceeds, sold the same day, is a good-faith violation", () => {
  const one = runBacktest(sessions(1), strategy());
  assert.equal(one.trades.length, 2);
  assert.equal(!!one.trades[0].goodFaithViolation, false); // paid with settled cash
  assert.equal(one.trades[1].goodFaithViolation, true); // bought with trade 1's proceeds, sold the same day
  assert.deepEqual(one.settlement, { goodFaithViolations: 1, maxIn12Months: 1, restricted: false });

  // Next day the earlier proceeds have settled, so the day's first trade is fine again
  const three = runBacktest(sessions(3), strategy());
  assert.deepEqual(three.trades.map((t) => !!t.goodFaithViolation), [false, true, false, true, false, true]);
  assert.deepEqual(three.settlement, { goodFaithViolations: 3, maxIn12Months: 3, restricted: true });
});

test("cash account: no violation when settled cash covers the re-buy", () => {
  const r = runBacktest(sessions(2), strategy({ positionSizePct: 40 }));
  assert.equal(r.settlement.goodFaithViolations, 0);
});

test("trading day follows US Eastern time across daylight saving", () => {
  assert.equal(tradingDay(Date.UTC(2026, 9, 21, 3, 30) / 1000), 20261020); // 23:30 EDT
  assert.equal(tradingDay(Date.UTC(2026, 9, 21, 4, 30) / 1000), 20261021);
  assert.equal(tradingDay(Date.UTC(2026, 0, 15, 4, 30) / 1000), 20260114); // 23:30 EST
  assert.equal(tradingDay(Date.UTC(2026, 0, 15, 5, 30) / 1000), 20260115);
  assert.equal(tradingDay(Date.UTC(2026, 2, 8, 6, 30) / 1000), 20260308); // DST starts 8 Mar 2026: 01:30 EST
  assert.equal(tradingDay(Date.UTC(2026, 2, 9, 3, 30) / 1000), 20260308); // 23:30 EDT
});

test("presets set costs and account type, keep stops, and switch market when needed", () => {
  const s = { ...defaultStrategy(), risk: { ...defaultStrategy().risk, stopLossPct: 3, takeProfitPct: 6 } };
  const p = applySmallAccountPreset(s, "stocks-cash");
  assert.equal(p.market, "stocks");
  assert.equal(p.symbol, "SPY");
  assert.equal(p.account, "cash");
  assert.deepEqual(
    [p.risk.initialCapital, p.risk.feePct, p.risk.slippagePct, p.risk.stopLossPct, p.risk.takeProfitPct],
    [500, 0, 0.05, 3, 6]
  );
  const c = applySmallAccountPreset(s, "crypto-retail");
  assert.equal(c.symbol, "BTCUSDT"); // already crypto: symbol kept
  assert.equal(c.risk.feePct, 0.6);
  assert.equal(SMALL_ACCOUNT_PRESETS.every((x) => normalizeStrategy(applySmallAccountPreset(s, x.key)).risk.slippagePct === 0.05), true);
});

test("marketplace fit: average verified move at least 2× small-account round-trip cost", () => {
  const trade = (entryPrice, exitPrice, direction = "long") => ({ entryPrice, exitPrice, direction });
  const fit = smallAccountFit([trade(100, 101), trade(100, 100.4)], "crypto"); // avg +0.7% vs 0.3% cost
  assert.equal(fit.friendly, true);
  assert.equal(smallAccountFit([trade(100, 100.4)], "crypto").friendly, false); // 0.4% < 0.6%
  assert.equal(smallAccountFit([trade(100, 99, "short")], "stocks").friendly, true); // short +1%
  assert.equal(smallAccountFit([], "crypto"), null);
  assert.equal(smallAccountFit([trade(1, 2)], "csv"), null);
});

test("Pine export notes slippage only when it's set", () => {
  assert.equal(generatePine(strategy()).includes("slippage"), false);
  assert.match(generatePine(strategy({ slippagePct: 0.05 })), /adds 0\.05% slippage per fill/);
});
