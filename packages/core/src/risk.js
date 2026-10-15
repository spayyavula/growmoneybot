// Risk statistics for comparing strategies fairly, plus fact-sheet helpers.
// These are derived from an equity curve and are NOT part of a verification receipt,
// so adding or refining them never changes an existing receipt hash.
import { INTERVALS } from "./catalog.js";

export const TARGET_VOL_PCT = 10; // compare every strategy as if it ran at 10% annual volatility
export const MAX_RISK_SCALE = 5; // don't lever a near-flat strategy more than 5x when scaling it
export const LOW_SAMPLE_BARS = 30;

const barsPerYear = (interval) => INTERVALS.find((x) => x.key === interval)?.barsPerYear ?? 365;
const r4 = (v) => (Number.isFinite(v) ? Number(v.toFixed(4)) : null);

/**
 * Risk profile of an equity curve ([{ time, value }]).
 *  volatilityPct      annualized volatility of bar-to-bar returns
 *  riskAdjReturnPct   annual return if the strategy were scaled to TARGET_VOL_PCT volatility
 *                     (= Sharpe ratio × target, no risk-free rate), comparable across leverage levels
 *  riskAdjMaxDrawdownPct  worst drawdown of the same scaled curve
 *  scale              leverage multiple used for scaling (capped at MAX_RISK_SCALE)
 *  rating             1 (calm) – 5 (very risky), from the strategy's own volatility and drawdown
 */
export function riskProfile(equity, interval, { targetVolPct = TARGET_VOL_PCT } = {}) {
  const n = equity?.length ?? 0;
  if (n < 3) return null;
  const rets = [];
  for (let i = 1; i < n; i++) {
    const prev = equity[i - 1].value;
    rets.push(prev > 0 ? equity[i].value / prev - 1 : 0);
  }
  const bpy = barsPerYear(interval);
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length);
  const vol = sd * Math.sqrt(bpy);

  // Drawdown of the strategy as configured
  let peak = -Infinity, maxDD = 0;
  for (const { value } of equity) { peak = Math.max(peak, value); maxDD = Math.max(maxDD, (peak - value) / peak); }

  let riskAdj = null, scaledDD = null, scale = null;
  if (vol > 0) {
    scale = Math.min(MAX_RISK_SCALE, targetVolPct / 100 / vol);
    riskAdj = (mean * bpy / vol) * targetVolPct; // Sharpe × target vol, in %
    let e = 1, p = 1, dd = 0;
    for (const r of rets) {
      e = Math.max(0, e * (1 + scale * r));
      p = Math.max(p, e);
      dd = Math.max(dd, p > 0 ? (p - e) / p : 1);
    }
    scaledDD = dd * 100;
  }

  return {
    targetVolPct,
    volatilityPct: r4(vol * 100),
    maxDrawdownPct: r4(maxDD * 100),
    riskAdjReturnPct: r4(riskAdj),
    riskAdjMaxDrawdownPct: r4(scaledDD),
    scale: r4(scale),
    rating: riskRating(vol * 100, maxDD * 100),
    lowSample: n < LOW_SAMPLE_BARS,
  };
}

// 1–5 like a fund fact sheet's risk indicator: the worse of a volatility band and a drawdown band
const VOL_BANDS = [10, 20, 35, 60];
const DD_BANDS = [10, 20, 35, 50];
const band = (v, bands) => 1 + bands.filter((b) => v >= b).length;
export function riskRating(volatilityPct, maxDrawdownPct) {
  if (!Number.isFinite(volatilityPct) || !Number.isFinite(maxDrawdownPct)) return null;
  return Math.max(band(volatilityPct, VOL_BANDS), band(maxDrawdownPct, DD_BANDS));
}
export const RISK_LABELS = { 1: "Very low", 2: "Low", 3: "Medium", 4: "High", 5: "Very high" };

/** Calendar-month returns (UTC) from an equity curve: [{ y, m (1-12), r (%) }] */
export function monthlyReturns(equity) {
  const out = [];
  if (!equity?.length) return out;
  let base = equity[0].value, cur = null, last = null;
  for (const { time, value } of equity) {
    const d = new Date(time * 1000);
    const key = d.getUTCFullYear() * 12 + d.getUTCMonth();
    if (cur !== null && key !== cur) {
      out.push({ y: Math.floor(cur / 12), m: (cur % 12) + 1, r: r4((last / base - 1) * 100) });
      base = last;
    }
    cur = key; last = value;
  }
  if (cur !== null) out.push({ y: Math.floor(cur / 12), m: (cur % 12) + 1, r: r4((last / base - 1) * 100) });
  return out;
}

/** Buy-and-hold equity over candles, starting at `initial` (bought at the first open). */
export function holdCurve(candles, initial = 10000) {
  if (!candles?.length) return [];
  const start = candles[0].open;
  return candles.map((c) => ({ time: c.time, value: initial * (c.close / start) }));
}

/** The broad-market benchmark for a market: Bitcoin for crypto, the S&P 500 ETF for stocks. */
export const marketBenchmark = (market) => (market === "stocks" ? { symbol: "SPY", label: "S&P 500 (SPY)" } : { symbol: "BTCUSDT", label: "Bitcoin" });
