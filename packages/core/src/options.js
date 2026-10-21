// Options overlay: the strategy's entry and exit rules run on the stock, and each trade is
// placed as an options position instead of shares. Option prices come from Black-Scholes
// with the stock's recent realized volatility, so results are model ESTIMATES: real prices
// also depend on implied volatility, skew and liquidity, which the model only approximates.
//
// Structures (defined risk, small-account friendly):
//   single  → long call (direction "long") or long put ("short")
//   spread  → bull call debit spread ("long") or bear put debit spread ("short")
import { ruleSeries } from "./evaluate.js";
import { computeMetrics } from "./backtest.js";
import { etOffsetHours, tradingDay, etCloseTime } from "./marketTime.js";

export const OPTION_DEFAULTS = {
  structure: "spread", // "single" | "spread"
  delta: 0.5, // delta of the bought leg (0.5 ≈ at the money)
  spreadWidth: 2, // spreads: $ between the bought and sold strikes; max loss per contract is below width × 100
  dte: 30, // calendar days to expiry when opening; the expiry is the next Friday on or after
  riskPct: 25, // max premium per trade, % of equity (also the most a trade can lose)
  takeProfitPct: 50, // close when the position is up this % on the premium paid (0 = off)
  stopLossPct: 50, // close when it's down this % of the premium paid (0 = off)
  feePerContract: 0.65, // per contract, per leg, each side ($)
  spreadPct: 2, // bid-ask width as % of the option's mid price (min $0.02)
  volMultiplier: 1.1, // implied vol = realized vol × this (options usually price above realized)
  volLookbackDays: 20, // trading days of returns for realized vol
  ratePct: 4, // risk-free rate, % per year
};

const LIMITS = {
  delta: [0.05, 0.95], spreadWidth: [0.5, 100], dte: [1, 365], riskPct: [1, 100], takeProfitPct: [0, 1000],
  stopLossPct: [0, 100], feePerContract: [0, 10], spreadPct: [0, 50], volMultiplier: [0.5, 3], volLookbackDays: [5, 120], ratePct: [0, 20],
};

export function normalizeOptions(o = {}) {
  const out = { structure: o?.structure === "single" ? "single" : "spread" };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const n = Number(o?.[k]);
    out[k] = o?.[k] === "" || !Number.isFinite(n) ? OPTION_DEFAULTS[k] : Math.min(hi, Math.max(lo, n));
  }
  out.dte = Math.round(out.dte);
  out.volLookbackDays = Math.round(out.volLookbackDays);
  return out;
}

// ---- Black-Scholes -------------------------------------------------------------

// Standard normal CDF (Abramowitz & Stegun 7.1.26 on erf, |error| < 1.5e-7)
export function normCdf(x) {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

// Inverse standard normal CDF (Acklam's rational approximation, relative error < 1.2e-9)
export function normInv(p) {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  if (p < lo) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - lo) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

const intrinsic = (type, S, K) => Math.max(0, type === "call" ? S - K : K - S);

/** European option price. T in years, r and sigma as decimals. */
export function bsPrice(type, S, K, T, r, sigma) {
  if (!(T > 0) || !(sigma > 0)) return intrinsic(type, S, K);
  const sq = sigma * Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / sq;
  const d2 = d1 - sq;
  return type === "call"
    ? S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
    : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
}

export function bsDelta(type, S, K, T, r, sigma) {
  if (!(T > 0) || !(sigma > 0)) return type === "call" ? (S > K ? 1 : 0) : (S < K ? -1 : 0);
  const d1 = (Math.log(S / K) + (r + (sigma * sigma) / 2) * T) / (sigma * Math.sqrt(T));
  return type === "call" ? normCdf(d1) : normCdf(d1) - 1;
}

/** Strike whose delta has the given size (0–1) for a call or put. */
export function strikeForDelta(type, S, T, r, sigma, delta) {
  const d1 = normInv(type === "call" ? delta : 1 - delta);
  return S * Math.exp(-d1 * sigma * Math.sqrt(T) + (r + (sigma * sigma) / 2) * T);
}

/** Listed strikes are spaced by price: $0.50 under $25, $1 under $1,000, else $5. */
export const strikeStep = (S) => (S < 25 ? 0.5 : S < 1000 ? 1 : 5);
const roundStrike = (K, S) => { const s = strikeStep(S); return Math.round(Math.round(K / s) * s * 100) / 100; };

/** Expiry: 16:00 ET on the first Friday at least `dte` calendar days after `ts`. */
export function expiryFor(ts, dte) {
  const target = ts + dte * 86400;
  const et = new Date((target + etOffsetHours(target) * 3600) * 1000);
  const ahead = (5 - et.getUTCDay() + 7) % 7;
  let exp = etCloseTime(et.getUTCFullYear(), et.getUTCMonth(), et.getUTCDate() + ahead);
  if (exp <= ts) exp = etCloseTime(et.getUTCFullYear(), et.getUTCMonth(), et.getUTCDate() + ahead + 7);
  return exp;
}

const YEAR = 365 * 86400;

// ---- Realized volatility ---------------------------------------------------------

/**
 * Annualized realized volatility for each bar, from close-to-close returns of the
 * `lookback` trading days (weeks, on weekly bars) before that bar's day — never its own
 * day, so a backtest can't peek. null until there's enough history.
 */
export function realizedVolSeries(bars, lookback, interval) {
  const weekly = interval === "1w";
  const periodsPerYear = weekly ? 52 : 252;
  const keyOf = (t) => (weekly ? t : tradingDay(t));
  const days = []; // [{ key, close }]
  const dayIndex = new Array(bars.length);
  for (let i = 0; i < bars.length; i++) {
    const k = keyOf(bars[i].time);
    if (!days.length || days[days.length - 1].key !== k) days.push({ key: k, close: bars[i].close });
    else days[days.length - 1].close = bars[i].close;
    dayIndex[i] = days.length - 1;
  }
  const rets = days.map((d, j) => (j > 0 ? Math.log(d.close / days[j - 1].close) : null));
  const volByDay = days.map((_, j) => {
    const window = rets.slice(Math.max(1, j - lookback), j); // returns that ended before day j
    if (window.length < Math.min(5, lookback)) return null;
    const mean = window.reduce((s, x) => s + x, 0) / window.length;
    const sd = Math.sqrt(window.reduce((s, x) => s + (x - mean) ** 2, 0) / Math.max(1, window.length - 1));
    return sd * Math.sqrt(periodsPerYear);
  });
  return dayIndex.map((j) => volByDay[j]);
}

// ---- Structures ------------------------------------------------------------------------

/** Pick strikes and expiry for a new position at stock price S, time ts. */
export function buildStructure({ S, ts, iv, direction, options }) {
  const o = normalizeOptions(options);
  const r = o.ratePct / 100;
  const type = direction === "short" ? "put" : "call";
  const expiry = expiryFor(ts, o.dte);
  const T = (expiry - ts) / YEAR;
  const step = strikeStep(S);
  const k1 = roundStrike(strikeForDelta(type, S, T, r, iv, o.delta), S);
  const legs = [{ type, strike: k1, side: 1 }];
  if (o.structure === "spread") {
    const width = Math.max(step, Math.round(o.spreadWidth / step) * step);
    const k2 = Math.round((type === "call" ? k1 + width : k1 - width) * 100) / 100;
    if (k2 > 0) legs.push({ type, strike: k2, side: -1 });
  }
  return { type, expiry, legs, width: legs.length > 1 ? Math.abs(legs[1].strike - legs[0].strike) : null };
}

/**
 * Price a structure. Returns the mid value (per share, net of sold legs) and the fill when
 * opening (buy the long leg at the ask, sell the short leg at the bid) or closing (reverse).
 */
export function priceStructure(st, { S, ts, iv, options, opening }) {
  const o = normalizeOptions(options);
  const r = o.ratePct / 100;
  const T = Math.max(0, (st.expiry - ts) / YEAR);
  let mid = 0, fill = 0;
  const legs = st.legs.map((leg) => {
    const m = bsPrice(leg.type, S, leg.strike, T, r, iv);
    const half = T > 0 ? Math.max(0.01, (m * o.spreadPct) / 200) : 0; // at expiry: settled at intrinsic
    const buying = opening ? leg.side > 0 : leg.side < 0;
    const price = buying ? m + half : Math.max(0, m - half);
    mid += leg.side * m;
    fill += leg.side * price;
    return { ...leg, mid: m, price };
  });
  return { mid, fill, legs, T };
}

/** Profit or loss per contract at expiry for a stock price, given the premium paid per share. */
export function payoffAtExpiry(st, premium, S, feesPerContract = 0) {
  const value = st.legs.reduce((s, l) => s + l.side * intrinsic(l.type, S, l.strike), 0);
  return (value - premium) * 100 - feesPerContract;
}

/** Max loss, max profit (null = unlimited) and breakeven at expiry, per contract. */
export function structureRisk(st, premium, feesPerContract = 0) {
  const k1 = st.legs[0].strike;
  const maxLoss = premium * 100 + feesPerContract;
  let maxProfit;
  if (st.width != null) maxProfit = (st.width - premium) * 100 - feesPerContract;
  else maxProfit = st.type === "call" ? null : (k1 - premium) * 100 - feesPerContract;
  const breakeven = st.type === "call" ? k1 + premium : k1 - premium;
  return { maxLoss, maxProfit, breakeven };
}

// ---- Backtest ---------------------------------------------------------------------------

const barStep = (bars) => {
  const diffs = [];
  for (let i = 1; i < Math.min(bars.length, 50); i++) diffs.push(bars[i].time - bars[i - 1].time);
  diffs.sort((a, b) => a - b);
  return diffs[0] || 86400;
};

export function runOptionsBacktest(bars, strategy) {
  if (!bars?.length || bars.length < 3) throw new Error("Not enough price data to backtest");
  if (strategy.market && strategy.market !== "stocks" && strategy.market !== "csv")
    throw new Error("Options are available for US stocks and ETFs. Switch the market to Stocks.");

  const o = normalizeOptions(strategy.options);
  const capital = Number(strategy.risk?.initialCapital) || 500;
  const direction = strategy.direction === "short" ? "short" : "long";
  const legsPer = o.structure === "spread" ? 2 : 1;
  const feeLeg = o.feePerContract;
  const step = barStep(bars);
  const cache = new Map();
  const entrySig = ruleSeries(bars, strategy.entry, cache);
  const exitSig = ruleSeries(bars, strategy.exit, cache);
  const vol = realizedVolSeries(bars, o.volLookbackDays, strategy.interval);
  const ivAt = (i) => (vol[i] == null ? null : Math.max(0.05, vol[i] * o.volMultiplier));

  let cash = capital;
  let pos = null; // { st, contracts, entryIndex, entryTime, S0, premium, entryMid, cost, fees, iv0 }
  let pending = null;
  let tooExpensive = 0, noVolatility = 0, feesPaid = 0, spreadPaid = 0;
  let cheapestSkipped = null; // smallest one-contract cost we couldn't afford
  const trades = [];
  const equity = [];

  const closePosition = (i, S, ts, reason) => {
    const iv = ivAt(i) ?? pos.iv0;
    const settle = reason === "expiry";
    const p = priceStructure(pos.st, { S, ts: settle ? pos.st.expiry : ts, iv, options: o, opening: false });
    const fees = settle ? 0 : feeLeg * legsPer * pos.contracts;
    const proceeds = p.fill * 100 * pos.contracts - fees;
    cash += proceeds;
    feesPaid += fees;
    spreadPaid += (p.mid - p.fill) * 100 * pos.contracts;
    const pnl = proceeds - pos.cost;
    const gross = (p.mid - pos.entryMid) * 100 * pos.contracts; // before spread and fees
    const base = pos.entryMid * 100 * pos.contracts || pos.cost;
    const risk = structureRisk(pos.st, pos.premium, feeLeg * legsPer * 2);
    trades.push({
      direction, entryTime: pos.entryTime, exitTime: bars[i].time, bars: i - pos.entryIndex, reason,
      entryPrice: pos.premium, exitPrice: p.fill, qty: pos.contracts, contracts: pos.contracts,
      underlyingEntry: pos.S0, underlyingExit: S, legs: pos.st.legs.map(({ type, strike, side }) => ({ type, strike, side })),
      expiry: pos.st.expiry, iv: pos.iv0, cost: pos.cost, pnl, pnlPct: (pnl / pos.cost) * 100,
      movePct: (gross / base) * 100, costPct: ((gross - pnl) / base) * 100,
      maxLoss: risk.maxLoss * pos.contracts, maxProfit: risk.maxProfit == null ? null : risk.maxProfit * pos.contracts,
    });
    pos = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const closeTs = bar.time + step;

    // 1) Orders queued at the previous close fill at this bar's open
    if (pending === "exit" && pos) closePosition(i, bar.open, bar.time, "signal");
    else if (pending === "entry" && !pos) {
      const iv = ivAt(i);
      if (iv == null) noVolatility++;
      else {
        const st = buildStructure({ S: bar.open, ts: bar.time, iv, direction, options: o });
        const p = priceStructure(st, { S: bar.open, ts: bar.time, iv, options: o, opening: true });
        const perContract = p.fill * 100 + feeLeg * legsPer;
        const budget = Math.min(cash, (cash * o.riskPct) / 100);
        const contracts = perContract > 0 ? Math.floor(budget / perContract) : 0;
        if (contracts < 1) {
          tooExpensive++;
          cheapestSkipped = Math.min(cheapestSkipped ?? Infinity, perContract);
        } else {
          const fees = feeLeg * legsPer * contracts;
          const cost = p.fill * 100 * contracts + fees;
          cash -= cost;
          feesPaid += fees;
          spreadPaid += (p.fill - p.mid) * 100 * contracts;
          pos = { st, contracts, entryIndex: i, entryTime: bar.time, S0: bar.open, premium: p.fill, entryMid: p.mid, cost, iv0: iv };
        }
      }
    }
    pending = null;

    // 2) Expiry: settle at intrinsic value on the last bar that closes at or before it
    if (pos && (closeTs >= pos.st.expiry || (bars[i + 1] && bars[i + 1].time > pos.st.expiry))) {
      closePosition(i, bar.close, closeTs, "expiry");
    }

    // 3) Take profit / stop loss on the premium, checked at the close
    if (pos && i > pos.entryIndex && (o.takeProfitPct > 0 || o.stopLossPct > 0)) {
      const iv = ivAt(i) ?? pos.iv0;
      const value = priceStructure(pos.st, { S: bar.close, ts: closeTs, iv, options: o, opening: false }).fill * 100 * pos.contracts;
      const change = (value - pos.cost) / pos.cost * 100;
      if (o.takeProfitPct > 0 && change >= o.takeProfitPct) closePosition(i, bar.close, closeTs, "take profit");
      else if (o.stopLossPct > 0 && change <= -o.stopLossPct) closePosition(i, bar.close, closeTs, "stop loss");
    }

    // 4) Rules on this bar's close; orders fill at the next open
    if (i < bars.length - 1) {
      if (pos && exitSig[i]) pending = "exit";
      else if (!pos && entrySig[i]) pending = "entry";
    }

    // 5) Mark to market at mid
    let open = 0;
    if (pos) {
      const iv = ivAt(i) ?? pos.iv0;
      open = priceStructure(pos.st, { S: bar.close, ts: closeTs, iv, options: o, opening: false }).mid * 100 * pos.contracts;
    }
    equity.push({ time: bar.time, value: cash + open });
  }

  const last = bars[bars.length - 1];
  let openTrade = null;
  if (pos) {
    const iv = ivAt(bars.length - 1) ?? pos.iv0;
    const value = priceStructure(pos.st, { S: last.close, ts: last.time + step, iv, options: o, opening: false }).fill * 100 * pos.contracts;
    openTrade = {
      direction, entryTime: pos.entryTime, entryPrice: pos.premium, qty: pos.contracts, contracts: pos.contracts,
      underlyingEntry: pos.S0, legs: pos.st.legs.map(({ type, strike, side }) => ({ type, strike, side })), expiry: pos.st.expiry,
      cost: pos.cost, unrealizedPnl: value - pos.cost,
    };
  }

  const n = trades.length;
  const avg = (k) => (n ? trades.reduce((s, t) => s + t[k], 0) / n : 0);
  const metrics = {
    ...computeMetrics({ bars, trades, equity, risk: { initialCapital: capital }, interval: strategy.interval }),
    openPnl: openTrade?.unrealizedPnl ?? 0,
    instrument: "options",
    feesPaid, slippagePaid: spreadPaid, feePct: 0, slippagePct: o.spreadPct,
    avgMovePct: avg("movePct"), roundTripCostPct: avg("costPct"),
    avgPremium: avg("cost"), expiredWorthless: trades.filter((t) => t.reason === "expiry" && t.exitPrice <= 0).length,
    tooExpensive, noVolatility, rejectedOrders: tooExpensive,
  };

  // What the rules would open at the latest close, for the structure preview
  const iv = ivAt(bars.length - 1);
  let preview = null;
  if (iv != null) {
    const st = buildStructure({ S: last.close, ts: last.time + step, iv, direction, options: o });
    const p = priceStructure(st, { S: last.close, ts: last.time + step, iv, options: o, opening: true });
    const feesRound = feeLeg * legsPer * 2;
    const perContract = p.fill * 100 + feeLeg * legsPer;
    const T = (st.expiry - (last.time + step)) / YEAR;
    const lo = last.close * Math.max(0.3, 1 - 2.5 * iv * Math.sqrt(T));
    const hi = last.close * (1 + 2.5 * iv * Math.sqrt(T));
    preview = {
      underlying: last.close, asOf: last.time, iv, realizedVol: vol[bars.length - 1], expiry: st.expiry, dte: Math.round((st.expiry - last.time) / 86400),
      legs: p.legs, premium: p.fill, mid: p.mid, perContract, ...structureRisk(st, p.fill, feesRound),
      affordableContracts: Math.floor(Math.min(capital, (capital * o.riskPct) / 100) / perContract),
      payoff: Array.from({ length: 61 }, (_, k) => { const S = lo + ((hi - lo) * k) / 60; return { S, pnl: payoffAtExpiry(st, p.fill, S, feesRound) }; }),
      structure: st,
    };
  }

  return {
    trades, openTrade, equity, signals: { entry: entrySig, exit: exitSig }, metrics,
    settlement: null,
    options: { settings: o, preview, cheapestSkipped, assumptions: { volLookbackDays: o.volLookbackDays, volMultiplier: o.volMultiplier, ratePct: o.ratePct } },
  };
}
