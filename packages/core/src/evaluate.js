import * as I from "./indicators.js";

export function sourceSeries(bars, source) {
  switch (source) {
    case "open": return bars.map((b) => b.open);
    case "high": return bars.map((b) => b.high);
    case "low": return bars.map((b) => b.low);
    case "hl2": return bars.map((b) => (b.high + b.low) / 2);
    case "hlc3": return bars.map((b) => (b.high + b.low + b.close) / 3);
    case "ohlc4": return bars.map((b) => (b.open + b.high + b.low + b.close) / 4);
    default: return bars.map((b) => b.close);
  }
}

export const operandKey = (op) => JSON.stringify([op.type, op.params, op.field ?? null]);

// Compute the series for one operand (cached per evaluation run).
export function computeOperand(bars, op, cache = new Map()) {
  const key = operandKey(op);
  if (cache.has(key)) return cache.get(key);
  const p = op.params || {};
  const src = () => sourceSeries(bars, p.source || "close");
  const H = () => bars.map((b) => b.high);
  const L = () => bars.map((b) => b.low);
  const C = () => bars.map((b) => b.close);
  let out;
  switch (op.type) {
    case "value": out = bars.map(() => Number(p.value)); break;
    case "price": out = src(); break;
    case "volume": out = bars.map((b) => b.volume ?? NaN); break;
    case "sma": out = I.sma(src(), p.length); break;
    case "ema": out = I.ema(src(), p.length); break;
    case "rsi": out = I.rsi(src(), p.length); break;
    case "atr": out = I.atr(H(), L(), C(), p.length); break;
    case "macd": out = I.macd(src(), p.fast, p.slow, p.signal)[op.field || "line"]; break;
    case "bb": out = I.bb(src(), p.length, p.mult)[op.field || "middle"]; break;
    case "stoch": out = I.stoch(C(), H(), L(), p.kLength, p.kSmooth, p.dSmooth)[op.field || "k"]; break;
    default: throw new Error(`Unknown operand type: ${op.type}`);
  }
  cache.set(key, out);
  return out;
}

const valid = (...xs) => xs.every((x) => typeof x === "number" && !Number.isNaN(x));

function conditionSeries(bars, cond, cache) {
  const a = computeOperand(bars, cond.left, cache);
  const b = computeOperand(bars, cond.right, cache);
  return bars.map((_, i) => {
    switch (cond.op) {
      case ">": return valid(a[i], b[i]) && a[i] > b[i];
      case "<": return valid(a[i], b[i]) && a[i] < b[i];
      case ">=": return valid(a[i], b[i]) && a[i] >= b[i];
      case "<=": return valid(a[i], b[i]) && a[i] <= b[i];
      case "crossesAbove":
        return i > 0 && valid(a[i], b[i], a[i - 1], b[i - 1]) && a[i] > b[i] && a[i - 1] <= b[i - 1];
      case "crossesBelow":
        return i > 0 && valid(a[i], b[i], a[i - 1], b[i - 1]) && a[i] < b[i] && a[i - 1] >= b[i - 1];
      default: return false;
    }
  });
}

// Combine a rule group ({ logic: "all" | "any", conditions }) into one boolean series.
export function ruleSeries(bars, group, cache = new Map()) {
  const conds = group?.conditions || [];
  if (!conds.length) return bars.map(() => false);
  const series = conds.map((c) => conditionSeries(bars, c, cache));
  return bars.map((_, i) =>
    group.logic === "any" ? series.some((s) => s[i]) : series.every((s) => s[i])
  );
}
