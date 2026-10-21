// Marketplace verification: the server fetches its own market data, runs the shared backtest
// engine, freezes the rules + dataset, and keeps a forward (live) track record.
import {
  verifyBacktest, livePerformance, strategySpec, candleRows, downsample, slimTrades, smallAccountFit,
  LIVE_WARMUP_BARS, MIN_VERIFIED_TRADES,
} from "@gmb/core";
import Algorithm from "./models/Algorithm.js";
import AlgoDataset from "./models/AlgoDataset.js";
import { getCandles, INTERVAL_SECONDS, MAX_BARS } from "./marketData.js";
import { initialWatermark, selectNewEvents, isLiveDue } from "./liveEvents.js";
import { alertFollowers } from "./followerAlerts.js";

export class PublishError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const equityPoints = (equity, max) => downsample(equity, max).map((p) => ({ time: p.time, value: Number(p.value.toPrecision(10)) }));

/** Verify a strategy on fresh server-side data. Returns the fields to store on an Algorithm. */
export async function snapshot(strategy) {
  const spec = strategySpec(strategy);
  if (spec.market === "csv") throw new PublishError("Uploaded CSV data can't be verified. Use crypto or stock data to publish.");
  if (spec.instrument === "options") throw new PublishError("Options strategies can't be published to the marketplace yet. Their results are model estimates, not verified prices.");
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

// Refresh when a new bar should have closed since the last one seen (see isLiveDue)
export const isLiveStale = (algo) =>
  isLiveDue(algo.live, INTERVAL_SECONDS[algo.interval] || 86400, Math.floor(Date.now() / 1000));

/**
 * Recompute forward performance since the current version's publish date, and alert
 * followers about trades the algorithm made since the last refresh.
 */
export async function refreshLive(algo) {
  const since = Math.floor(new Date(algo.publishedAt).getTime() / 1000);
  const step = INTERVAL_SECONDS[algo.interval] || 86400;
  const barsSince = Math.ceil((Date.now() / 1000 - since) / step);
  const bars = Math.min(MAX_BARS, LIVE_WARMUP_BARS + barsSince + 2);
  const prev = algo.live?.toObject?.() ?? algo.live ?? {};
  let fresh = [];
  let claimed = false;
  try {
    const candles = await getCandles({ market: algo.market, symbol: algo.symbol, interval: algo.interval, bars, completeOnly: true });
    const lp = livePerformance(algo.spec, candles, since);

    const watermark = initialWatermark(prev, since, step);
    const sel = selectNewEvents(lp.events, { watermark, nowSec: Math.floor(Date.now() / 1000), stepSec: step });
    if (sel.watermark > watermark) {
      // Claim these events atomically: a page view and the scheduled refresh can run at the
      // same time, and only the one that moves the watermark sends the alerts.
      const r = await Algorithm.updateOne(
        { _id: algo._id, version: algo.version, $or: [{ "live.notifiedThrough": { $exists: false } }, { "live.notifiedThrough": { $lt: sel.watermark } }] },
        { $set: { "live.notifiedThrough": sel.watermark } }
      );
      claimed = r.modifiedCount === 1;
      if (claimed) fresh = sel.fresh;
    }

    algo.live = {
      since: algo.publishedAt, started: lp.started, bars: lp.bars, metrics: lp.metrics,
      equity: lp.started ? equityPoints(lp.equity, 300) : [], trades: slimTrades(lp.trades).slice(-200),
      openTrade: lp.openTrade, updatedAt: new Date(), error: undefined,
      lastBarTime: candles.length ? candles[candles.length - 1].time : undefined,
      notifiedThrough: Math.max(sel.watermark, Number.isFinite(prev.notifiedThrough) ? prev.notifiedThrough : -Infinity),
    };
  } catch (err) {
    // Keep the last good result; record the problem and try again next time
    algo.live = { ...prev, since: algo.publishedAt, updatedAt: new Date(), error: String(err.message || err).slice(0, 200) };
  }
  algo.markModified("live");
  await algo.save();

  if (fresh.length && algo.status === "published") {
    try {
      await alertFollowers(algo, fresh);
    } catch (err) {
      console.error("Follower alerts failed", String(algo._id), err.message);
    }
  }
  return algo;
}

/** Refresh the published algorithms that have a new bar, stalest first, within a time budget (scheduled function, every 15 min). */
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

/** Listing card: results only, never the rules. */
export function cardView(a) {
  return {
    _id: a._id, name: a.name, summary: a.summary, tags: a.tags, status: a.status,
    market: a.market, symbol: a.symbol, interval: a.interval, direction: a.direction,
    version: a.version, publishedAt: a.publishedAt, followers: a.followers, copies: a.copies,
    author: authorView(a.author),
    verified: {
      metrics: pick(a.verification?.metrics, CARD_KEYS), receiptHash: a.verification?.receiptHash,
      from: a.verification?.from, to: a.verification?.to, bars: a.verification?.bars,
      spark: downsample(a.verification?.equity || [], 48).map((p) => p.value),
    },
    live: {
      started: !!a.live?.started, since: a.live?.since || a.publishedAt, updatedAt: a.live?.updatedAt,
      metrics: pick(a.live?.metrics, CARD_KEYS),
    },
    // Does the verified edge hold up at small-account costs? (see smallAccountFit in @gmb/core)
    smallAccount: smallAccountFit(a.verification?.trades, a.market),
  };
}

/** Full page. Rules are included only when `canSeeRules`. */
export function detailView(a, { canSeeRules = false, following = false, notify = false, isAuthor = false, isAdmin = false } = {}) {
  return {
    ...cardView(a),
    description: a.description,
    removedReason: isAuthor || isAdmin ? a.removedReason : undefined,
    verification: a.verification,
    live: { ...(a.live?.toObject?.() ?? a.live ?? {}), since: a.live?.since || a.publishedAt },
    history: a.history,
    rules: canSeeRules ? a.spec : null,
    access: { following, notify, isAuthor, isAdmin, canSeeRules },
  };
}
