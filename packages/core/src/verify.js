// Verification for published (marketplace) algorithms. Platform-neutral: runs the same way
// on the server (Node 20+) and in the browser, so anyone holding the frozen rules and dataset
// can reproduce a result and compare it with the stored receipt.
//
//   specHash    = SHA-256 of the canonical rules (market, symbol, timeframe, rules, risk)
//   dataHash    = SHA-256 of the canonical OHLCV dataset the server fetched itself
//   receiptHash = SHA-256 of { engine, specHash, dataHash, metrics }
import { runBacktest, computeMetrics } from "./backtest.js";
import { normalizeStrategy } from "./catalog.js";

export const ENGINE_VERSION = "gmb-backtest/1";
export const LIVE_WARMUP_BARS = 600; // indicator warm-up before the publish date (max indicator length is 500)
export const MIN_VERIFIED_TRADES = 10;

const RECEIPT_KEYS = [
  "netProfit", "netProfitPct", "totalReturnPct", "cagrPct", "buyHoldPct", "maxDrawdownPct", "totalTrades",
  "winRatePct", "profitFactor", "avgTradePct", "sharpe", "exposurePct", "finalEquity", "openPnl", "bars", "from", "to",
];

// JSON with sorted object keys; non-finite numbers become strings so they hash consistently
export function canonicalJson(value) {
  const walk = (v) => {
    if (v === null || v === undefined) return null;
    if (typeof v === "number") return Number.isFinite(v) ? v : String(v);
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

export async function sha256Hex(text) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("SHA-256 isn't available in this environment");
  const buf = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

// The parts of a strategy that determine its results, normalized
export function strategySpec(s) {
  const n = normalizeStrategy(s);
  return {
    market: n.market, symbol: String(n.symbol || "").toUpperCase(), interval: n.interval, bars: n.bars,
    direction: n.direction === "short" ? "short" : "long", entry: n.entry, exit: n.exit, risk: n.risk,
  };
}

export const candleRows = (candles) => candles.map((c) => [c.time, c.open, c.high, c.low, c.close, c.volume ?? 0]);
export const rowsToCandles = (rows) => rows.map(([time, open, high, low, close, volume]) => ({ time, open, high, low, close, volume }));

const round = (v) => (typeof v === "number" ? (Number.isFinite(v) ? Number(v.toPrecision(10)) : String(v)) : v ?? null);

// Metrics as stored in a receipt: fixed keys, rounded to 10 significant digits
export function receiptMetrics(m, initialCapital) {
  const all = { ...m };
  if (all.totalReturnPct === undefined && Number.isFinite(all.finalEquity) && initialCapital > 0)
    all.totalReturnPct = (all.finalEquity / initialCapital - 1) * 100;
  return Object.fromEntries(RECEIPT_KEYS.map((k) => [k, round(all[k])]));
}

// Same metrics within a small tolerance (floating-point pow/log can differ in the last digits across engines)
export function metricsMatch(a, b, rel = 1e-6) {
  const diffs = [];
  for (const k of RECEIPT_KEYS) {
    const x = a?.[k], y = b?.[k];
    if (typeof x === "number" && typeof y === "number") {
      if (Math.abs(x - y) > rel * Math.max(1, Math.abs(x), Math.abs(y))) diffs.push(k);
    } else if (x !== y) diffs.push(k);
  }
  return { match: diffs.length === 0, diffs };
}

export function downsample(points, max = 400) {
  if (!points || points.length <= max) return points || [];
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

export const slimTrades = (trades = []) => trades.map((t) => ({
  direction: t.direction, entryTime: t.entryTime, entryPrice: round(t.entryPrice), exitTime: t.exitTime,
  exitPrice: round(t.exitPrice), pnl: round(t.pnl), pnlPct: round(t.pnlPct), bars: t.bars, reason: t.reason,
}));

/** Run the backtest on a fixed dataset and produce the verification receipt. */
export async function verifyBacktest(strategy, candles) {
  const spec = strategySpec(strategy);
  if (!spec.entry.conditions.length) throw new Error("Add at least one entry condition");
  const result = runBacktest(candles, spec);
  const metrics = receiptMetrics(result.metrics, spec.risk.initialCapital);
  const [specHash, dataHash] = await Promise.all([
    sha256Hex(canonicalJson(spec)),
    sha256Hex(canonicalJson(candleRows(candles))),
  ]);
  const receiptHash = await sha256Hex(canonicalJson({ engine: ENGINE_VERSION, specHash, dataHash, metrics }));
  return { engine: ENGINE_VERSION, spec, specHash, dataHash, receiptHash, metrics, result };
}

/** Recompute a receipt hash from its parts (lets anyone check a stored receipt). */
export const receiptHashOf = ({ engine, specHash, dataHash, metrics }) =>
  sha256Hex(canonicalJson({ engine, specHash, dataHash, metrics }));

/**
 * Forward (live) performance: only trades the rules entered on or after `since` (unix seconds).
 * Bars before `since` are only used to warm up indicators.
 */
export function livePerformance(strategy, candles, since) {
  const spec = strategySpec(strategy);
  const start = candles.findIndex((c) => c.time >= since);
  if (start < 0 || start >= candles.length - 1) return { started: false, bars: 0, metrics: null, equity: [], trades: [], openTrade: null, events: [] };
  const result = runBacktest(candles, spec, { tradeFrom: since });
  const bars = candles.slice(start);
  const equity = result.equity.slice(start);
  const metrics = receiptMetrics(
    { ...computeMetrics({ bars, trades: result.trades, equity, risk: spec.risk, interval: spec.interval }), openPnl: result.openTrade?.unrealizedPnl ?? 0 },
    spec.risk.initialCapital
  );
  return {
    started: true, bars: bars.length, metrics, equity, trades: result.trades, openTrade: result.openTrade,
    events: liveEvents(candles, result, spec.direction, since),
  };
}

/**
 * Trading events (entries and exits) from a live run, for alerting followers.
 *
 * Each event has a `key`: the unix time of the completed bar that triggered it — the signal bar
 * for rule-based entries and exits (the order fills at the next bar's open), or the bar where a
 * stop loss / take profit was hit. A signal on the newest completed bar has no fill yet
 * (`pending: true`); once it fills, the trade carries the same key, so an alert sent for the
 * pending signal is never sent twice.
 *
 * Sorted by key; on the same bar an exit comes before an entry.
 */
export function liveEvents(candles, result, direction = "long", since = 0) {
  const index = new Map(candles.map((c, i) => [c.time, i]));
  const signalBar = (fillTime) => {
    const i = index.get(fillTime);
    return i > 0 ? candles[i - 1].time : fillTime;
  };
  const enter = direction === "short" ? "sell" : "buy";
  const leave = direction === "short" ? "buy" : "sell";
  const events = [];

  const entryOf = (t) => ({
    key: signalBar(t.entryTime), type: "entry", action: enter, pending: false,
    time: t.entryTime, price: round(t.entryPrice), reason: "signal",
  });
  for (const t of result.trades || []) {
    events.push(entryOf(t));
    events.push({
      key: t.reason === "signal" ? signalBar(t.exitTime) : t.exitTime, type: "exit", action: leave, pending: false,
      time: t.exitTime, price: round(t.exitPrice), reason: t.reason, pnlPct: round(t.pnlPct),
    });
  }
  if (result.openTrade) events.push(entryOf(result.openTrade));

  // Signals on the newest completed bar: the backtest can't fill them yet, so report them as pending
  const last = candles.length - 1;
  const bar = candles[last];
  if (bar && result.signals) {
    const pendingEvent = (type, action) => ({
      key: bar.time, type, action, pending: true, time: null, price: round(bar.close), reason: "signal",
    });
    if (result.openTrade && result.signals.exit?.[last]) events.push(pendingEvent("exit", leave));
    else if (!result.openTrade && result.signals.entry?.[last] && bar.time >= since) events.push(pendingEvent("entry", enter));
  }

  return events.sort((a, b) => a.key - b.key || (a.type === b.type ? 0 : a.type === "exit" ? -1 : 1));
}
