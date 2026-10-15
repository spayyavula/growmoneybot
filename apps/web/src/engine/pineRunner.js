// ---------------------------------------------------------------------------
// Pine Lab runner — executes user Pine Script in the browser with PineTS.
//
// LICENSE NOTE: PineTS is licensed AGPL-3.0 (or commercially by LuxAlgo).
// This file is the only place it is used. Delete this file, the Pine Lab page
// and the "pinets" dependency to remove it completely.
// ---------------------------------------------------------------------------

const PALETTE = ["#2962ff", "#ff6d00", "#00897b", "#d81b60", "#8e24aa", "#6d4c41", "#43a047"];

export async function runPine(code, candles) {
  const { PineTS } = await import("pinets"); // loaded only when Pine Lab runs

  const interval = candles.length > 1 ? (candles[1].time - candles[0].time) * 1000 : 86400000;
  const data = candles.map((c) => ({
    open: c.open, high: c.high, low: c.low, close: c.close, volume: c.volume ?? 0,
    openTime: c.time * 1000, closeTime: c.time * 1000 + interval - 1,
  }));

  const ctx = await new PineTS(data).run(code);
  const overlay = /\b(indicator|strategy)\s*\([^)]*overlay\s*=\s*true/s.test(code);

  const lines = [];
  const markers = [];
  let colorIdx = 0;
  for (const [title, plot] of Object.entries(ctx.plots || {})) {
    if (title.startsWith("__")) continue;
    const pts = plot.data || [];
    const sample = pts.find((p) => p.value !== null && p.value !== undefined)?.value;
    if (typeof sample === "boolean") {
      for (const p of pts) {
        if (p.value === true) markers.push({ time: Math.floor(p.time / 1000), position: "belowBar", color: "#7c3aed", shape: "circle", size: 0.5 });
      }
      continue;
    }
    const color = typeof pts.find((p) => p.options?.color)?.options?.color === "string"
      ? pts.find((p) => p.options?.color).options.color
      : PALETTE[colorIdx++ % PALETTE.length];
    lines.push({
      name: title,
      color: /^#[0-9a-f]{6,8}$/i.test(color) ? color.slice(0, 7) : PALETTE[colorIdx++ % PALETTE.length],
      data: pts
        .filter((p) => typeof p.value === "number" && Number.isFinite(p.value))
        .map((p) => ({ time: Math.floor(p.time / 1000), value: p.value })),
    });
  }

  const s = ctx.strategy;
  let strategy = null;
  if (s && (s.closedtrades?.length || s.opentrades?.length || /\bstrategy\s*\(/.test(code))) {
    const trades = (s.closedtrades || []).map((t) => ({
      direction: t.size < 0 ? "short" : "long",
      entryTime: Math.floor(t.entry_time / 1000),
      exitTime: Math.floor(t.exit_time / 1000),
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      qty: Math.abs(t.size),
      pnl: t.profit,
      pnlPct: (t.profit / Math.abs(t.entry_price * t.size)) * 100,
      reason: t.exit_comment || t.exit_id || "",
    }));
    const wins = trades.filter((t) => t.pnl > 0);
    const gp = wins.reduce((a, t) => a + t.pnl, 0);
    const gl = -trades.filter((t) => t.pnl <= 0).reduce((a, t) => a + t.pnl, 0);
    strategy = {
      trades,
      metrics: {
        netProfit: s.netprofit,
        netProfitPct: (s.netprofit / s.initial_capital) * 100,
        buyHoldPct: s.buy_and_hold_per_gain,
        maxDrawdownPct: s.max_drawdown_percent_value,
        totalTrades: trades.length,
        winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
        profitFactor: gl > 0 ? gp / gl : gp > 0 ? Infinity : 0,
        openPnl: s.openprofit,
        initialCapital: s.initial_capital,
      },
    };
  }

  return { overlay, lines, markers, strategy, warnings: ctx.warnings || [] };
}

export const SAMPLE_PINE = `//@version=6
strategy("RSI mean reversion", overlay=false, initial_capital=10000,
     default_qty_type=strategy.percent_of_equity, default_qty_value=50,
     commission_type=strategy.commission.percent, commission_value=0.1)

length = input.int(14, "RSI length")
r = ta.rsi(close, length)

if ta.crossover(r, 30)
    strategy.entry("Long", strategy.long)
if ta.crossunder(r, 70)
    strategy.close("Long")

plot(r, "RSI", color=#7c3aed)
plot(70, "Overbought", color=#9ca3af)
plot(30, "Oversold", color=#9ca3af)
`;
