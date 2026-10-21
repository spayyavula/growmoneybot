// Preview-only mock of the GrowMoneyBot API. Intercepts fetch("/api/...") in the browser so the
// web app runs with no server: sample prices from a seeded random walk, and marketplace
// algorithms verified and live-tracked by the real @gmb/core engine. Nothing is saved.
import {
  verifyBacktest, livePerformance, slimTrades, downsample, smallAccountFit, candleRows,
  normalizeStrategy, strategySpec, TEMPLATES, fmt,
} from "@gmb/core";
import { eventNotification } from "../../../../server/liveEvents.js";

const STEP = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };
const BASE = { BTCUSDT: 67000, ETHUSDT: 2500, SOLUSDT: 150, XRPUSDT: 0.55, DOGEUSDT: 0.12, SPY: 580, QQQ: 495, AAPL: 230, MSFT: 420, NVDA: 135, TSLA: 220 };
const nowSec = () => Math.floor(Date.now() / 1000);
const id = () => Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10) + "00000000";

// ---- Sample prices ---------------------------------------------------------

function rng(seedText) {
  let h = 2166136261;
  for (const ch of seedText) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let x = h >>> 0 || 1;
  return () => ((x = Math.imul(x ^ (x >>> 15), 2246822507) ^ Math.imul(x ^ (x >>> 13), 3266489909)) >>> 0) / 4294967296;
}

// US regular session in Eastern time (EDT/EST handled like the engine does)
const etOffset = (t) => {
  const d = new Date(t * 1000), y = d.getUTCFullYear();
  const sun = (m, n) => { const f = new Date(Date.UTC(y, m, 1)).getUTCDay(); return 1 + ((7 - f) % 7) + 7 * (n - 1); };
  const ms = t * 1000;
  return ms >= Date.UTC(y, 2, sun(2, 2), 7) && ms < Date.UTC(y, 10, sun(10, 1), 6) ? -4 : -5;
};
function sessionTimes(interval, count) {
  const step = STEP[interval];
  const out = [];
  if (interval === "1d" || interval === "1w") {
    let t = Math.floor(nowSec() / 86400) * 86400 - 86400; // yesterday 00:00 UTC
    while (out.length < count) {
      const wd = new Date(t * 1000).getUTCDay();
      if (interval === "1w" ? wd === 1 : wd !== 0 && wd !== 6) out.unshift(t);
      t -= 86400;
    }
    return out;
  }
  // intraday: bars inside 09:30–16:00 ET on weekdays, newest completed first
  let t = Math.floor(nowSec() / step) * step - step;
  while (out.length < count) {
    const off = etOffset(t);
    const et = new Date((t + off * 3600) * 1000);
    const mins = et.getUTCHours() * 60 + et.getUTCMinutes();
    const wd = et.getUTCDay();
    if (wd !== 0 && wd !== 6 && mins >= 570 && mins + step / 60 <= 960 + (step >= 3600 ? 30 : 0)) out.unshift(t);
    t -= step;
  }
  return out;
}

const candleCache = new Map();
export function sampleCandles({ market, symbol, interval, bars }) {
  const key = `${market}:${symbol}:${interval}`;
  const want = Math.min(5000, Math.max(50, Number(bars) || 1000));
  let all = candleCache.get(key);
  if (!all) {
    const step = STEP[interval] || 86400;
    const n = 5000;
    const times = market === "stocks"
      ? sessionTimes(interval, n)
      : Array.from({ length: n }, (_, i) => Math.floor(nowSec() / step) * step - (n - i) * step);
    const r = rng(key);
    const perHour = market === "stocks" ? 0.0035 : 0.007;
    const vol = perHour * Math.sqrt(Math.min(step, market === "stocks" && step >= 86400 ? 6.5 * 3600 * (step / 86400) : step) / 3600);
    let p = (BASE[symbol] ?? 100) * 0.7;
    let drift = 0;
    all = times.map((time, i) => {
      if (i % 120 === 0) drift = (r() - 0.45) * vol * 0.35; // regimes: trends come and go
      const o = p;
      const z = (r() + r() + r() - 1.5) * 2; // ~normal
      p = Math.max(o * 0.5, o * (1 + drift + z * vol));
      const hi = Math.max(o, p) * (1 + r() * vol * 0.6);
      const lo = Math.min(o, p) * (1 - r() * vol * 0.6);
      return { time, open: o, high: hi, low: lo, close: p, volume: Math.round(1000 + r() * 9000) };
    });
    // Anchor the latest close to a realistic price for the symbol
    const k = (BASE[symbol] ?? 100) / all[all.length - 1].close;
    all = all.map((c) => ({ ...c, open: c.open * k, high: c.high * k, low: c.low * k, close: c.close * k }));
    candleCache.set(key, all);
  }
  return all.slice(-want);
}

// ---- Users, strategies, alerts ------------------------------------------------

const user = {
  id: "u-preview", name: "Demo trader", email: "demo@growmoneybot.com", webhookToken: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6",
  notifyOnSignals: true, createdAt: new Date(Date.now() - 40 * 86400e3).toISOString(), isAdmin: false,
  expert: { status: "none", displayName: "", bio: "", markets: [], links: { website: "", x: "", tradingview: "" } },
};

const stamp = () => new Date().toISOString();
const strategies = [
  {
    // An older strategy, saved with the previous $10,000 / no-slippage defaults
    ...normalizeStrategy({ ...TEMPLATES[0].build(), name: "BTC 1h EMA crossover", interval: "1h", risk: { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 0, takeProfitPct: 0 } }),
    _id: id(), createdAt: stamp(), updatedAt: stamp(),
  },
  {
    ...normalizeStrategy({
      ...TEMPLATES[0].build(), name: "SPY 15m fast EMA (cash account)", market: "stocks", symbol: "SPY", interval: "15m", account: "cash", bars: 2000,
      entry: { logic: "all", conditions: [{ left: { type: "ema", params: { source: "close", length: 5 } }, op: "crossesAbove", right: { type: "ema", params: { source: "close", length: 13 } } }] },
      exit: { logic: "any", conditions: [{ left: { type: "ema", params: { source: "close", length: 5 } }, op: "crossesBelow", right: { type: "ema", params: { source: "close", length: 13 } } }] },
      risk: { initialCapital: 500, positionSizePct: 95, feePct: 0, slippagePct: 0.05, stopLossPct: 0, takeProfitPct: 0 },
    }),
    _id: id(), createdAt: stamp(), updatedAt: stamp(),
  },
];
const pine = [];
let signals = [];

// ---- Marketplace ---------------------------------------------------------------

const authors = {
  e1: { id: "e1", displayName: "Maya Chen", markets: ["crypto"], bio: "Ten years trading crypto momentum. Systematic, small position sizes.", },
  e2: { id: "e2", displayName: "Rafael Ortiz", markets: ["stocks"], bio: "Index swing trader. Trend filters first, signals second.", },
};
const ema = (len) => ({ type: "ema", params: { source: "close", length: len } });
const ALGOS = [
  {
    author: "e1", name: "BTC trend rider", summary: "Rides 1h EMA trends on Bitcoin with a 3% stop.", tags: ["momentum", "btc"],
    strategy: { market: "crypto", symbol: "BTCUSDT", interval: "1h", bars: 3000, direction: "long",
      entry: { logic: "all", conditions: [{ left: ema(20), op: "crossesAbove", right: ema(100) }] },
      exit: { logic: "any", conditions: [{ left: ema(20), op: "crossesBelow", right: ema(100) }] },
      risk: { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 3, takeProfitPct: 0 } },
    followers: 214, copies: 37,
  },
  {
    author: "e1", name: "ETH quick scalper", summary: "Fast 15m EMA crosses on Ethereum. Many small trades.", tags: ["scalping", "eth"],
    strategy: { market: "crypto", symbol: "ETHUSDT", interval: "15m", bars: 3000, direction: "long",
      entry: { logic: "all", conditions: [{ left: ema(5), op: "crossesAbove", right: ema(13) }] },
      exit: { logic: "any", conditions: [{ left: ema(5), op: "crossesBelow", right: ema(13) }] },
      risk: { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 0, takeProfitPct: 0 } },
    followers: 96, copies: 12,
  },
  {
    author: "e2", name: "SPY MACD trend", summary: "Daily MACD crosses on SPY, only above the 200-day average.", tags: ["trend", "index"],
    strategy: { ...TEMPLATES[2].build(), market: "stocks", symbol: "SPY", interval: "1d", bars: 2500, direction: "long" },
    followers: 158, copies: 22,
  },
];

let marketplace = null;
async function buildMarketplace() {
  const out = [];
  for (const [i, a] of ALGOS.entries()) {
    const spec = strategySpec(a.strategy);
    const step = STEP[spec.interval];
    const publishedAt = new Date((nowSec() - 120 * step) * 1000); // published 120 bars ago
    const pub = Math.floor(publishedAt.getTime() / 1000);
    const all = sampleCandles({ ...spec, bars: 5000 });
    const verifiedData = all.filter((c) => c.time + step <= pub).slice(-spec.bars);
    const v = await verifyBacktest(spec, verifiedData);
    const lp = livePerformance(spec, all, pub);
    const algo = {
      _id: `algo${i + 1}000000000000000000`.slice(0, 24), name: a.name, summary: a.summary, tags: a.tags, status: "published",
      description: "Sample algorithm for the preview. Results are computed by the real GrowMoneyBot engine on sample prices.",
      market: spec.market, symbol: spec.symbol, interval: spec.interval, direction: spec.direction,
      version: 1, publishedAt: publishedAt.toISOString(), followers: a.followers, copies: a.copies,
      author: authors[a.author], spec, rows: candleRows(verifiedData),
      verification: {
        engine: v.engine, specHash: v.specHash, dataHash: v.dataHash, receiptHash: v.receiptHash, metrics: v.metrics,
        equity: downsample(v.result.equity, 400), trades: slimTrades(v.result.trades), openTrade: v.result.openTrade,
        from: verifiedData[0].time, to: verifiedData[verifiedData.length - 1].time, bars: verifiedData.length, verifiedAt: publishedAt.toISOString(),
      },
      live: {
        since: publishedAt.toISOString(), started: lp.started, bars: lp.bars, metrics: lp.metrics,
        equity: downsample(lp.equity, 300), trades: slimTrades(lp.trades), openTrade: lp.openTrade,
        updatedAt: new Date(Date.now() - 6 * 60e3).toISOString(),
      },
      events: lp.events, history: [],
    };
    out.push(algo);
  }
  return out;
}

const follows = new Map(); // algorithm id → { notify }
const pick = (m, keys) => (m ? Object.fromEntries(keys.map((k) => [k, m[k] ?? null])) : null);
const CARD_KEYS = ["totalReturnPct", "netProfitPct", "cagrPct", "maxDrawdownPct", "totalTrades", "winRatePct", "profitFactor", "sharpe", "buyHoldPct"];
const cardView = (a) => ({
  _id: a._id, name: a.name, summary: a.summary, tags: a.tags, status: a.status,
  market: a.market, symbol: a.symbol, interval: a.interval, direction: a.direction,
  version: a.version, publishedAt: a.publishedAt, followers: a.followers, copies: a.copies, author: a.author,
  verified: {
    metrics: pick(a.verification.metrics, CARD_KEYS), receiptHash: a.verification.receiptHash,
    from: a.verification.from, to: a.verification.to, bars: a.verification.bars,
    spark: downsample(a.verification.equity, 48).map((p) => p.value),
  },
  live: { started: a.live.started, since: a.live.since, updatedAt: a.live.updatedAt, metrics: pick(a.live.metrics, CARD_KEYS) },
  smallAccount: smallAccountFit(a.verification.trades, a.market),
});
const detailView = (a) => {
  const f = follows.get(a._id);
  return {
    ...cardView(a), description: a.description, verification: a.verification, live: a.live, history: a.history,
    rules: f ? a.spec : null,
    access: { following: !!f, notify: !!f && f.notify, isAuthor: false, isAdmin: false, canSeeRules: !!f },
  };
};

// Alerts a follower would have received: the algorithm's recent live trades
function alertsFor(a) {
  return a.events.slice(-4).map((e) => ({
    _id: id(), user: user.id, source: "marketplace", algorithm: a._id, algorithmName: a.name, algorithmVersion: a.version,
    type: e.type, action: e.action, ticker: a.symbol, interval: a.interval, price: e.price, pending: e.pending, reason: e.reason,
    pnlPct: e.pnlPct, message: eventNotification(a, e, fmt.price).body,
    createdAt: new Date(((e.key + STEP[a.interval]) + 90) * 1000).toISOString(),
  }));
}
function refreshSignals() {
  const tv = {
    _id: "tv-sample", user: user.id, source: "tradingview", strategyId: strategies[0]._id, type: "entry", action: "buy",
    ticker: "BTCUSDT", exchange: "BINANCEUS", interval: "60", price: 67412.5,
    raw: '{"type":"entry","action":"buy","ticker":"BTCUSDT","exchange":"BINANCEUS","interval":"60","price":67412.5}',
    createdAt: new Date(Date.now() - 26 * 3600e3).toISOString(),
  };
  const list = [tv, ...marketplace.filter((a) => follows.get(a._id)?.notify).flatMap(alertsFor)];
  signals = list.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
}

// ---- Routing -----------------------------------------------------------------------

const ok = (body = {}, status = 200) => ({ status, body: { ok: true, ...body } });
const fail = (status, error) => ({ status, body: { ok: false, error } });

async function handle(method, path, query, body) {
  if (!marketplace) { marketplace = await buildMarketplace(); follows.set(marketplace[0]._id, { notify: true }); follows.set(marketplace[1]._id, { notify: true }); refreshSignals(); }
  const seg = path.split("/").filter(Boolean);
  const [a0, a1, a2] = seg;

  if (a0 === "auth") {
    if (a1 === "login" || a1 === "signup") return ok({ token: "preview", user });
    if (a1 === "me") return ok({ user });
    if (a1 === "settings") { Object.assign(user, { notifyOnSignals: body?.notifyOnSignals !== false }); return ok({ user }); }
    if (a1 === "webhook-token") return ok({ user });
    if (a1 === "account") return fail(400, "Account deletion is off in the preview.");
  }
  if (a0 === "subscribers") return a1 === "count" ? ok({ count: 1280 }) : ok({});
  if (a0 === "contact") return ok({});
  if (a0 === "devices") return ok({});

  if (a0 === "strategies") {
    if (!a1) {
      if (method === "GET") return ok({ strategies });
      const s = { ...normalizeStrategy(body), _id: id(), createdAt: stamp(), updatedAt: stamp() };
      strategies.unshift(s);
      return ok({ strategy: s }, 201);
    }
    const i = strategies.findIndex((s) => s._id === a1);
    if (i < 0) return fail(404, "Strategy not found");
    if (a2 === "backtest") { strategies[i].lastBacktest = { metrics: body.metrics, ranAt: stamp() }; return ok({}); }
    if (method === "GET") return ok({ strategy: strategies[i] });
    if (method === "PUT") { strategies[i] = { ...strategies[i], ...normalizeStrategy({ ...strategies[i], ...body }), updatedAt: stamp() }; return ok({ strategy: strategies[i] }); }
    if (method === "DELETE") { strategies.splice(i, 1); return ok({}); }
  }

  if (a0 === "pine") {
    if (!a1) {
      if (method === "GET") return ok({ scripts: pine });
      const s = { ...body, _id: id(), updatedAt: stamp() }; pine.unshift(s); return ok({ script: s }, 201);
    }
    const i = pine.findIndex((s) => s._id === a1);
    if (method === "PUT" && i >= 0) { pine[i] = { ...pine[i], ...body, updatedAt: stamp() }; return ok({ script: pine[i] }); }
    if (method === "DELETE" && i >= 0) { pine.splice(i, 1); return ok({}); }
    return fail(404, "Script not found");
  }

  if (a0 === "market" && a1 === "candles") {
    await new Promise((r) => setTimeout(r, 250));
    return ok({ candles: sampleCandles({ market: query.get("market"), symbol: query.get("symbol"), interval: query.get("interval"), bars: query.get("bars") }) });
  }

  if (a0 === "signals") {
    if (method === "DELETE") { signals = []; return ok({}); }
    return ok({ signals });
  }

  if (a0 === "experts") {
    if (a1 === "me") return method === "GET" ? ok({ expert: user.expert }) : ok({ user });
    if (a1 === "apply") { user.expert = { ...user.expert, ...body, status: "pending", appliedAt: stamp() }; return ok({ user }); }
    const au = authors[a1];
    if (!au) return fail(404, "Expert not found");
    return ok({ expert: { ...au, status: "approved", links: {}, memberSince: user.createdAt }, algorithms: marketplace.filter((a) => a.author.id === a1).map(cardView) });
  }

  if (a0 === "marketplace") {
    if (!a1) {
      let list = marketplace.slice();
      if (query.get("market")) list = list.filter((a) => a.market === query.get("market"));
      const q = (query.get("q") || "").toLowerCase();
      if (q) list = list.filter((a) => `${a.name} ${a.summary} ${a.symbol} ${a.tags.join(" ")}`.toLowerCase().includes(q));
      let cards = list.map(cardView);
      if (query.get("small") === "1") cards = cards.filter((c) => c.smallAccount?.friendly);
      const sort = query.get("sort") || "followers";
      const key = { followers: (c) => c.followers, live: (c) => c.live.metrics?.totalReturnPct ?? -1e9, verified: (c) => c.verified.metrics?.totalReturnPct ?? -1e9, new: (c) => Date.parse(c.publishedAt) }[sort];
      if (key) cards.sort((x, y) => key(y) - key(x));
      return ok({ algorithms: cards });
    }
    if (a1 === "following") return ok({ algorithms: marketplace.filter((a) => follows.has(a._id)).map(cardView) });
    if (a1 === "mine") return ok({ algorithms: [] });
    const algo = marketplace.find((a) => a._id === a1);
    if (!algo) return fail(404, "Algorithm not found");
    if (!a2) return ok({ algorithm: detailView(algo) });
    if (a2 === "follow") {
      if (method === "POST") { if (!follows.has(algo._id)) { follows.set(algo._id, { notify: true }); algo.followers++; } }
      else if (method === "DELETE") { if (follows.delete(algo._id)) algo.followers--; }
      else if (method === "PUT") { if (!follows.has(algo._id)) return fail(404, "You don't follow this algorithm"); follows.get(algo._id).notify = !!body.notify; }
      refreshSignals();
      const f = follows.get(algo._id);
      return ok({ following: !!f, notify: !!f?.notify });
    }
    if (a2 === "copy") {
      const s = { ...normalizeStrategy(algo.spec), name: `${algo.name} (copy)`, _id: id(), createdAt: stamp(), updatedAt: stamp(), source: { algorithm: algo._id, version: 1 } };
      strategies.unshift(s); algo.copies++;
      return ok({ strategy: s }, 201);
    }
    if (a2 === "dataset") return ok({ version: 1, dataHash: algo.verification.dataHash, rows: algo.rows });
  }
  if (a0 === "admin") return fail(403, "Admin is off in the preview.");
  return fail(404, `Not available in the preview: ${method} /api${path}`);
}

export function installMockApi() {
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, window.location.href);
    if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return realFetch(input, init);
    const method = (init.method || "GET").toUpperCase();
    let body = null;
    try { body = init.body ? JSON.parse(init.body) : null; } catch { /* not JSON */ }
    let res;
    try { res = await handle(method, url.pathname.slice(4), url.searchParams, body); }
    catch (err) { console.error(err); res = fail(500, `Preview error: ${err.message}`); }
    return new Response(JSON.stringify(res.body), { status: res.status, headers: { "Content-Type": "application/json" } });
  };
}
