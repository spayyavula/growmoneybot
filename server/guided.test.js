// Guided builder: every combination of answers gives a complete, runnable strategy.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildGuidedStrategy, GUIDED_STYLES, GUIDED_PACES, GUIDED_RISK, runBacktest, normalizeStrategy, strategySpec, canonicalJson,
} from "../packages/core/src/index.js";

// Deterministic trending-and-chopping prices; weekday bars for stocks, every bar for crypto
function sampleBars(interval, market, n) {
  const step = { "1h": 3600, "1d": 86400, "1w": 604800 }[interval];
  const out = [];
  let t = Date.UTC(2022, 0, 3, 14, 30) / 1000, p = 100, seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  while (out.length < n) {
    const wd = new Date(t * 1000).getUTCDay();
    if (market === "crypto" || interval === "1w" || (wd !== 0 && wd !== 6)) {
      const o = p;
      p = Math.max(5, p * (1 + Math.sin(out.length / 60) * 0.004 + (rnd() - 0.5) * 0.03));
      out.push({ time: t, open: o, high: Math.max(o, p) * 1.004, low: Math.min(o, p) * 0.996, close: p, volume: 1 });
    }
    t += step;
  }
  return out;
}

test("every style × pace × risk × market × instrument builds and backtests", () => {
  let n = 0;
  for (const market of ["crypto", "stocks"]) for (const instrument of ["shares", "options"]) {
    if (market === "crypto" && instrument === "options") continue;
    for (const style of GUIDED_STYLES) for (const pace of GUIDED_PACES) for (const risk of GUIDED_RISK) {
      const { strategy, summary } = buildGuidedStrategy({ market, instrument, style: style.key, pace: pace.key, risk: risk.key, capital: 5000 });
      assert.deepEqual(strategy, normalizeStrategy(strategy), "already normalized");
      assert.equal(strategy.interval, pace.interval);
      assert.ok(strategy.entry.conditions.length >= 1 && strategy.exit.conditions.length >= 1);
      assert.ok(summary.length >= 4 && strategy.description.startsWith("Made with the guided builder."));
      const r = runBacktest(sampleBars(pace.interval, market, Math.min(strategy.bars, 1200)), strategy);
      assert.ok(Number.isFinite(r.metrics.netProfit), `${market} ${instrument} ${style.key} ${pace.key} ${risk.key}`);
      n++;
    }
  }
  assert.equal(n, 3 * 4 * 3 * 3);
});

test("risk levels set size, stop and target; stops scale with the pace", () => {
  const s = (risk, pace = "daily") => buildGuidedStrategy({ style: "trend", pace, risk }).strategy.risk;
  assert.deepEqual([s("careful").positionSizePct, s("careful").stopLossPct, s("careful").takeProfitPct], [50, 5, 10]);
  assert.deepEqual([s("balanced").positionSizePct, s("balanced").stopLossPct, s("balanced").takeProfitPct], [95, 7, 0]);
  assert.deepEqual([s("bold").positionSizePct, s("bold").stopLossPct], [100, 10]);
  assert.ok(s("balanced", "intraday").stopLossPct < s("balanced").stopLossPct && s("balanced").stopLossPct < s("balanced", "weekly").stopLossPct);
});

test("careful dip buying and breakouts add a long-term trend filter", () => {
  const conds = (style, risk) => buildGuidedStrategy({ style, risk, pace: "daily" }).strategy.entry.conditions;
  assert.equal(conds("dip", "careful").length, 2);
  assert.equal(conds("dip", "careful")[1].right.params.length, 200);
  assert.equal(conds("dip", "bold").length, 1);
  assert.equal(conds("breakout", "careful").length, 2);
  assert.equal(buildGuidedStrategy({ style: "dip", risk: "careful", pace: "weekly" }).strategy.entry.conditions[1].right.params.length, 50);
});

test("costs and account type follow the market and amount", () => {
  const crypto = buildGuidedStrategy({ market: "crypto", capital: 500, style: "trend" }).strategy;
  assert.deepEqual([crypto.risk.feePct, crypto.risk.slippagePct, crypto.risk.initialCapital], [0.1, 0.05, 500]);
  const small = buildGuidedStrategy({ market: "stocks", capital: 1500, account: "margin", style: "trend" });
  assert.equal(small.strategy.account, "cash");
  assert.match(small.warnings.join(" "), /Margin accounts need at least \$2,000/);
  assert.equal(buildGuidedStrategy({ market: "stocks", capital: 3000, account: "margin", style: "trend" }).strategy.account, "margin");
  assert.equal(small.strategy.risk.feePct, 0);
});

test("options only for stocks, sized by risk level, with a clear affordability warning", () => {
  assert.equal(buildGuidedStrategy({ market: "crypto", instrument: "options", style: "trend" }).strategy.instrument, undefined);
  const o = buildGuidedStrategy({ market: "stocks", instrument: "options", style: "momentum", pace: "weekly", risk: "careful", capital: 500 });
  assert.equal(o.strategy.instrument, "options");
  assert.deepEqual([o.strategy.options.structure, o.strategy.options.riskPct, o.strategy.options.dte], ["spread", 15, 60]);
  assert.equal(o.strategy.risk.stopLossPct, 0); // the option's own stop applies instead
  assert.match(o.warnings.join(" "), /start with about \$750/);
  assert.equal(buildGuidedStrategy({ market: "stocks", instrument: "options", style: "trend", risk: "balanced", capital: 500 }).warnings.length, 0);
});

test("the rules a beginner saves hash the same as if typed into the builder", () => {
  const { strategy } = buildGuidedStrategy({ market: "crypto", style: "breakout", pace: "intraday", risk: "balanced" });
  assert.equal(canonicalJson(strategySpec(strategy)), canonicalJson(strategySpec(JSON.parse(JSON.stringify(strategy)))));
  assert.equal(strategy.name, "Breakout trader · BTCUSDT hourly");
});
