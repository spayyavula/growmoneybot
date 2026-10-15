// Marketplace verification: the server fetches its own market data, runs the shared backtest
// engine, freezes the rules + dataset, and keeps a forward (live) track record.
import {
  verifyBacktest, livePerformance, strategySpec, candleRows, downsample, slimTrades,
  LIVE_WARMUP_BARS, MIN_VERIFIED_TRADES, riskProfile, monthlyReturns, holdCurve, marketBenchmark,
} from "@gmb/core";
import Algorithm from "./models/Algorithm.js";
import AlgoDataset from "./models/AlgoDataset.js";
import { getCandles, INTERVAL_SECONDS, MAX_BARS } from "./marketData.js";

export class PublishError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export const MIN_LIVE_TRADES = 3;
// Backtests overstate what strategies do next, so an unproven backtest counts at half weight
export const BACKTEST_RANK_WEIGHT = 0.5;

const hasLiveHistory = (live) => !!live?.started && !!live?.risk && !live.risk.lowSample && (live.metrics?.totalTrades ?? 0) >= MIN_LIVE_TRADES;

/** One number to rank by: live risk-adjusted return once proven, otherwise a discounted backtest. */
export function rankScore({ verification, live }) {
  if (hasLiveHistory(live) && Number.isFinite(live.risk.riskAdjReturnPct)) return live.risk.riskAdjReturnPct;
  const b = verification?.risk?.riskAdjReturnPct;
  return Number.isFinite(b) ? b * BACKTEST_RANK_WEIGHT : null;
}
const equityPoints = (equity, max) => downsample(equity, max).map((p) => ({ time: p.time, value: Number(p.value.toPrecision(10)) }));

// Buy-and-hold comparisons over the same bars: the algorithm's own symbol, and the broad market
// (Bitcoin for crypto, SPY for stocks). A failed benchmark fetch never blocks publishing.
async function benchmarks({ market, symbol, interval }, candles, initial) {
  const out = [];
  // Curves start from `initial` at the first bar's open, the same basis as the buy & hold metric
  const pack = (key, label, sym, curve) => curve.length > 1 && out.push({
    key, label, symbol: sym, base: initial, returnPct: Number(((curve[curve.length - 1].value / initial - 1) * 100).toPrecision(8)),
    equity: equityPoints(curve, 400),
  });
  pack("hold", `Hold ${symbol}`, symbol, holdCurve(candles, initial));
  const bm = marketBenchmark(market);
  if (bm.symbol !== symbol && candles.length > 1) {
    try {
      const from = candles[0].time, to = candles[candles.length - 1].time;
      const bc = (await getCandles({ market, symbol: bm.symbol, interval, bars: Math.min(MAX_BARS, candles.length + 10), completeOnly: true }))
        .filter((c) => c.time >= from && c.time <= to);
      pack("market", bm.label, bm.symbol, holdCurve(bc, initial));
    } catch { /* benchmark unavailable: show the algorithm without it */ }
  }
  return out;
}

/** Verify a strategy on fresh server-side data. Returns the fields to store on an Algorithm. */
export async function snapshot(strategy) {
  const spec = strategySpec(strategy);
  if (spec.market === "csv") throw new PublishError("Uploaded CSV data can't be verified. Use crypto or stock data to publish.");
  if (!spec.entry.conditions.length) throw new PublishError("Add at least one entry condition before publishing.");

  const candles = await getCandles({ market: spec.market, symbol: spec.symbol, interval: spec.interval, bars: spec.bars, completeOnly: true });
  if (candles.length < 200) throw new PublishError(`Only ${candles.length} bars of ${spec.symbol} data are available; at least 200 are needed to verify.`);

  const v = await verifyBacktest(spec, candles);
  if (v.metrics.totalTrades < MIN_VERIFIED_TRADES)
    throw new PublishError(`The verified backtest made ${v.metrics.totalTrades} trades. Published algorithms need at least ${MIN_VERIFIED_TRADES} closed trades so the results mean something.`);

  return {
    spec,
    rows: candleRows(candles),
    fields: {
      spec, market: spec.market, symbol: spec.symbol, interval: spec.interval, direction: spec.direction,
      verification: {
        engine: v.engine, specHash: v.specHash, dataHash: v.dataHash, receiptHash: v.receiptHash, metrics: v.metrics,
        equity: equityPoints(v.result.equity, 400), trades: slimTrades(v.result.trades), openTrade: v.result.openTrade,
        from: candles[0].time, to: candles[candles.length - 1].time, bars: candles.length, verifiedAt: new Date(),
        // Derived stats (not part of the receipt)
        risk: riskProfile(v.result.equity, spec.interval),
        monthly: monthlyReturns(v.result.equity),
        benchmarks: await benchmarks(spec, candles, spec.risk.initialCapital),
      },
    },
  };
}

export async function saveDataset(algorithmId, version, dataHash, rows) {
  await AlgoDataset.findOneAndUpdate(
    { algorithm: algorithmId, version },
    { $set: { dataHash, flat: rows.flat() } },
    { upsert: true }
  );
}

// How long a live result stays fresh: one bar, between 15 minutes and 6 hours
export const liveTtlMs = (interval) => Math.min(6 * 3600, Math.max(900, INTERVAL_SECONDS[interval] || 86400)) * 1000;
export const isLiveStale = (algo) => !algo.live?.updatedAt || Date.now() - new Date(algo.live.updatedAt).getTime() > liveTtlMs(algo.interval);

/** Recompute forward performance since the current version's publish date. */
export async function refreshLive(algo) {
  const since = Math.floor(new Date(algo.publishedAt).getTime() / 1000);
  const step = INTERVAL_SECONDS[algo.interval] || 86400;
  const barsSince = Math.ceil((Date.now() / 1000 - since) / step);
  const bars = Math.min(MAX_BARS, LIVE_WARMUP_BARS + barsSince + 2);
  try {
    const candles = await getCandles({ market: algo.market, symbol: algo.symbol, interval: algo.interval, bars, completeOnly: true });
    const lp = livePerformance(algo.spec, candles, since);
    const liveBars = lp.started ? candles.slice(candles.length - lp.bars) : [];
    algo.live = {
      since: algo.publishedAt, started: lp.started, bars: lp.bars, metrics: lp.metrics,
      risk: lp.started ? riskProfile(lp.equity, algo.interval) : null,
      benchmarks: lp.started ? await benchmarks(algo, liveBars, algo.spec?.risk?.initialCapital || 10000) : [],
      equity: lp.started ? equityPoints(lp.equity, 300) : [], trades: slimTrades(lp.trades).slice(-200),
      openTrade: lp.openTrade, updatedAt: new Date(), error: undefined,
    };
    algo.rankScore = rankScore(algo);
  } catch (err) {
    // Keep the last good result; record the problem and try again next time
    algo.live = { ...(algo.live?.toObject?.() ?? algo.live ?? {}), since: algo.publishedAt, updatedAt: new Date(), error: String(err.message || err).slice(0, 200) };
  }
  algo.markModified("live");
  await algo.save();
  return algo;
}

/** Refresh the stalest published algorithms within a time budget (used by the scheduled function). */
export async function refreshStale({ budgetMs = 20000, limit = 50 } = {}) {
  const started = Date.now();
  const list = await Algorithm.find({ status: "published" }).sort({ "live.updatedAt": 1 }).limit(limit);
  let refreshed = 0;
  for (const algo of list) {
    if (Date.now() - started > budgetMs) break;
    if (!isLiveStale(algo)) continue;
    await refreshLive(algo);
    refreshed++;
  }
  return { checked: list.length, refreshed };
}

// ---- Views ---------------------------------------------------------------

const authorView = (u) => (u ? { id: u._id, displayName: u.expert?.displayName || u.name || "Expert", markets: u.expert?.markets || [] } : null);

const pick = (m, keys) => (m ? Object.fromEntries(keys.map((k) => [k, m[k] ?? null])) : null);
const CARD_KEYS = ["totalReturnPct", "netProfitPct", "cagrPct", "maxDrawdownPct", "totalTrades", "winRatePct", "profitFactor", "sharpe", "buyHoldPct"];
const RISK_KEYS = ["riskAdjReturnPct", "riskAdjMaxDrawdownPct", "volatilityPct", "rating", "lowSample"];

/** Listing card: results only, never the rules. */
export function cardView(a) {
  return {
    _id: a._id, name: a.name, summary: a.summary, tags: a.tags, status: a.status,
    market: a.market, symbol: a.symbol, interval: a.interval, direction: a.direction,
    version: a.version, publishedAt: a.publishedAt, followers: a.followers, copies: a.copies,
    author: authorView(a.author),
    rankScore: a.rankScore ?? null,
    verified: {
      metrics: pick(a.verification?.metrics, CARD_KEYS), receiptHash: a.verification?.receiptHash,
      risk: pick(a.verification?.risk, RISK_KEYS),
      from: a.verification?.from, to: a.verification?.to, bars: a.verification?.bars,
      spark: downsample(a.verification?.equity || [], 48).map((p) => p.value),
    },
    live: {
      started: !!a.live?.started, since: a.live?.since || a.publishedAt, updatedAt: a.live?.updatedAt,
      metrics: pick(a.live?.metrics, CARD_KEYS),
      risk: pick(a.live?.risk, RISK_KEYS),
      // Too little live history to rank on: fewer than 30 bars or 3 trades
      lowSample: !hasLiveHistory(a.live),
    },
  };
}

/** Full page. Rules are included only when `canSeeRules`. */
export function detailView(a, { canSeeRules = false, following = false, isAuthor = false, isAdmin = false } = {}) {
  return {
    ...cardView(a),
    description: a.description,
    removedReason: isAuthor || isAdmin ? a.removedReason : undefined,
    verification: a.verification,
    live: { ...(a.live?.toObject?.() ?? a.live ?? {}), since: a.live?.since || a.publishedAt },
    history: a.history,
    rules: canSeeRules ? a.spec : null,
    access: { following, isAuthor, isAdmin, canSeeRules },
  };
}
