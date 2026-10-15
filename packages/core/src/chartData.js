import { OPERANDS, operandLabel } from "./catalog.js";
import { computeOperand, operandKey } from "./evaluate.js";

const COLORS = ["#2962ff", "#ff6d00", "#7c3aed", "#00897b", "#d81b60", "#6d4c41"];

/**
 * Chart overlays and indicator panes for the operands a strategy uses,
 * in a renderer-neutral shape (used by the web chart and the mobile WebView chart).
 */
export function strategyChartSeries(candles, strategy) {
  const cache = new Map();
  const overlays = [];
  const panes = new Map();
  const seen = new Set();
  const levels = new Map();
  let c = 0;

  const conds = [...(strategy.entry?.conditions || []), ...(strategy.exit?.conditions || [])];
  for (const cond of conds) {
    for (const [op, other] of [[cond.left, cond.right], [cond.right, cond.left]]) {
      const def = OPERANDS[op.type];
      if (!def || op.type === "value" || op.type === "price") continue;
      if (def.pane && other.type === "value") {
        if (!levels.has(def.pane)) levels.set(def.pane, new Set());
        levels.get(def.pane).add(Number(other.params.value));
      }
      const key = operandKey(op);
      if (seen.has(key)) continue;
      seen.add(key);
      const values = computeOperand(candles, op, cache);
      const data = [];
      for (let i = 0; i < candles.length; i++) if (Number.isFinite(values[i])) data.push({ time: candles[i].time, value: values[i] });
      const color = COLORS[c++ % COLORS.length];
      if (def.overlay) overlays.push({ name: operandLabel(op), color, data });
      else {
        if (!panes.has(def.pane)) panes.set(def.pane, { title: def.pane, series: [] });
        const type = op.type === "volume" || op.field === "hist" ? "histogram" : "line";
        panes.get(def.pane).series.push({ name: operandLabel(op), color: type === "histogram" ? "#9ccfb3" : color, type, data });
      }
    }
  }
  for (const [pane, vals] of levels) {
    const p = panes.get(pane);
    if (!p) continue;
    for (const v of vals) p.series.push({ name: String(v), color: "#b8b8b0", type: "line", data: candles.map((b) => ({ time: b.time, value: v })) });
  }
  return { overlays, panes: [...panes.values()] };
}

export function tradeMarkers(trades = [], openTrade = null) {
  const out = [];
  for (const t of trades) {
    const long = t.direction !== "short";
    out.push({ time: t.entryTime, position: long ? "belowBar" : "aboveBar", color: "#15a36b", shape: long ? "arrowUp" : "arrowDown", text: long ? "Buy" : "Short" });
    out.push({ time: t.exitTime, position: long ? "aboveBar" : "belowBar", color: t.pnl >= 0 ? "#0f3d2e" : "#e0473a", shape: long ? "arrowDown" : "arrowUp", text: `${t.pnl >= 0 ? "+" : ""}${t.pnlPct.toFixed(1)}%` });
  }
  if (openTrade) {
    const long = openTrade.direction !== "short";
    out.push({ time: openTrade.entryTime, position: long ? "belowBar" : "aboveBar", color: "#2962ff", shape: long ? "arrowUp" : "arrowDown", text: "Open" });
  }
  return out.sort((a, b) => a.time - b.time);
}
