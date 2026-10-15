import { ruleSeries } from "./evaluate.js";
import { INTERVALS } from "./catalog.js";

/**
 * Bar-by-bar backtest that mirrors TradingView's default strategy behaviour:
 *  - Conditions are evaluated on bar close; market orders fill at the NEXT bar's open.
 *  - Stop-loss / take-profit become active the bar after the entry fill
 *    (like strategy.exit() placed once a position exists).
 *  - If both stop and target are touched in one bar, the intrabar path follows
 *    TradingView's rule: if the high is closer to the open, price went up first.
 *  - Gaps through a stop/target fill at the open.
 *  - Commission is a percentage of traded value, charged on entry and exit.
 *
 * bars: [{ time (unix seconds), open, high, low, close, volume }]
 * options.tradeFrom: unix seconds; entry signals on bars before this time are ignored.
 *   Used for live (forward) tracking: indicators warm up on earlier bars, but only
 *   trades the rules open after the publish date count.
 */
export function runBacktest(bars, strategy, options = {}) {
  if (!bars?.length || bars.length < 3) throw new Error("Not enough price data to backtest");

  const risk = { initialCapital: 10000, positionSizePct: 100, feePct: 0, stopLossPct: 0, takeProfitPct: 0, ...strategy.risk };
  const dir = strategy.direction === "short" ? -1 : 1;
  const fee = (risk.feePct || 0) / 100;
  const sl = (risk.stopLossPct || 0) / 100;
  const tp = (risk.takeProfitPct || 0) / 100;

  const cache = new Map();
  const entrySig = ruleSeries(bars, strategy.entry, cache);
  const exitSig = ruleSeries(bars, strategy.exit, cache);

  let cash = risk.initialCapital;
  let pos = null; // { qty, entryPrice, entryIndex, entryFee }
  let pending = null; // "entry" | "exit" -> fills at next bar open
  let pendingQty = 0;
  let rejected = 0; // entries skipped because the fill would cost more than available equity
  const trades = [];
  const equity = [];

  const closePosition = (i, price, reason) => {
    const gross = dir * (price - pos.entryPrice) * pos.qty;
    const exitFee = price * pos.qty * fee;
    const pnl = gross - pos.entryFee - exitFee;
    cash += pos.entryPrice * pos.qty + gross - exitFee; // return margin + P&L
    trades.push({
      direction: dir === 1 ? "long" : "short",
      entryTime: bars[pos.entryIndex].time,
      entryPrice: pos.entryPrice,
      exitTime: bars[i].time,
      exitPrice: price,
      qty: pos.qty,
      pnl,
      pnlPct: (pnl / (pos.entryPrice * pos.qty)) * 100,
      bars: i - pos.entryIndex,
      reason,
    });
    pos = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];

    // 1) Fill orders queued at the previous bar's close
    if (pending === "exit" && pos) {
      closePosition(i, bar.open, "signal");
    } else if (pending === "entry" && !pos) {
      const qty = pendingQty;
      const entryFee = bar.open * qty * fee;
      if (qty > 0 && bar.open * qty + entryFee <= cash) {
        cash -= bar.open * qty + entryFee;
        pos = { qty, entryPrice: bar.open, entryIndex: i, entryFee };
      } else if (qty > 0) rejected++;
    }
    pending = null;

    // 2) Stop-loss / take-profit, active from the bar after the fill
    if (pos && i > pos.entryIndex && (sl > 0 || tp > 0)) {
      const stop = sl > 0 ? pos.entryPrice * (1 - dir * sl) : null;
      const target = tp > 0 ? pos.entryPrice * (1 + dir * tp) : null;
      const hitStop = stop != null && (dir === 1 ? bar.low <= stop : bar.high >= stop);
      const hitTarget = target != null && (dir === 1 ? bar.high >= target : bar.low <= target);

      if (hitStop || hitTarget) {
        const upFirst = Math.abs(bar.high - bar.open) <= Math.abs(bar.open - bar.low);
        // For a long, the target is on the upside; for a short, the stop is.
        let first;
        if (hitStop && hitTarget) {
          const targetIsUp = dir === 1;
          first = upFirst === targetIsUp ? "target" : "stop";
        } else first = hitStop ? "stop" : "target";

        if (first === "stop") {
          const gapped = dir === 1 ? bar.open <= stop : bar.open >= stop;
          closePosition(i, gapped ? bar.open : stop, "stop loss");
        } else {
          const gapped = dir === 1 ? bar.open >= target : bar.open <= target;
          closePosition(i, gapped ? bar.open : target, "take profit");
        }
      }
    }

    // 3) Evaluate signals on this bar's close (orders fill next bar)
    if (i < bars.length - 1) {
      if (pos && exitSig[i]) pending = "exit";
      else if (!pos && entrySig[i] && !(options.tradeFrom && bar.time < options.tradeFrom)) {
        // Pine's percent_of_equity sizing: equity * pct / signal-bar close, truncated to 6 decimals
        pending = "entry";
        pendingQty = Math.floor(((cash * risk.positionSizePct) / 100 / bar.close) * 1e6) / 1e6;
      }
    }

    // 4) Mark-to-market equity at the close
    const open = pos ? pos.entryPrice * pos.qty + dir * (bar.close - pos.entryPrice) * pos.qty : 0;
    equity.push({ time: bar.time, value: cash + open });
  }

  const openTrade = pos
    ? {
        direction: dir === 1 ? "long" : "short",
        entryTime: bars[pos.entryIndex].time,
        entryPrice: pos.entryPrice,
        qty: pos.qty,
        unrealizedPnl: dir * (bars[bars.length - 1].close - pos.entryPrice) * pos.qty - pos.entryFee,
      }
    : null;

  return {
    trades,
    openTrade,
    equity,
    signals: { entry: entrySig, exit: exitSig },
    metrics: {
      ...computeMetrics({ bars, trades, equity, risk, interval: strategy.interval }),
      openPnl: openTrade?.unrealizedPnl ?? 0,
      rejectedOrders: rejected,
    },
  };
}

export function computeMetrics({ bars, trades, equity, risk, interval }) {
  const start = risk.initialCapital;
  const end = equity[equity.length - 1].value;
  const closedNet = trades.reduce((s, t) => s + t.pnl, 0);
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);

  let peak = -Infinity;
  let maxDD = 0;
  for (const { value } of equity) {
    peak = Math.max(peak, value);
    maxDD = Math.max(maxDD, (peak - value) / peak);
  }

  const rets = [];
  for (let i = 1; i < equity.length; i++) rets.push(equity[i].value / equity[i - 1].value - 1);
  const mean = rets.reduce((s, r) => s + r, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length || 1));
  const barsPerYear = INTERVALS.find((x) => x.key === interval)?.barsPerYear ?? 365;
  const sharpe = sd > 0 ? (mean / sd) * Math.sqrt(barsPerYear) : 0;

  const years = (bars[bars.length - 1].time - bars[0].time) / (365.25 * 86400);
  const cagr = years > 0 && end > 0 ? ((end / start) ** (1 / years) - 1) * 100 : 0;
  const inMarket = trades.reduce((s, t) => s + t.bars, 0);

  return {
    // Like TradingView, net profit counts closed trades only; open P&L is reported separately.
    netProfit: closedNet,
    netProfitPct: (closedNet / start) * 100,
    cagrPct: cagr,
    buyHoldPct: (bars[bars.length - 1].close / bars[0].open - 1) * 100,
    maxDrawdownPct: maxDD * 100,
    totalTrades: trades.length,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
    avgTradePct: trades.length ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length : 0,
    sharpe,
    exposurePct: (inMarket / bars.length) * 100,
    finalEquity: end,
    bars: bars.length,
    from: bars[0].time,
    to: bars[bars.length - 1].time,
  };
}
