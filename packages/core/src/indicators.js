// Technical indicators that follow TradingView Pine Script semantics.
// Every function returns an array aligned with the input bars; NaN = "na".

const isNum = (x) => typeof x === "number" && !Number.isNaN(x);

export function sma(src, length) {
  const out = new Array(src.length).fill(NaN);
  let sum = 0;
  let count = 0; // consecutive valid values in window
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isNum(v)) { sum = 0; count = 0; continue; }
    sum += v;
    count++;
    if (count > length) { sum -= src[i - length]; count = length; }
    if (count === length) out[i] = sum / length;
  }
  return out;
}

// Exponential-style moving average seeded with an SMA of the first `length`
// valid values (Pine's ta.ema / ta.rma behaviour).
function seededMA(src, length, alpha) {
  const out = new Array(src.length).fill(NaN);
  let prev = NaN;
  let seedSum = 0;
  let seedCount = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (!isNum(v)) continue;
    if (!isNum(prev)) {
      seedSum += v;
      seedCount++;
      if (seedCount === length) { prev = seedSum / length; out[i] = prev; }
      continue;
    }
    prev = alpha * v + (1 - alpha) * prev;
    out[i] = prev;
  }
  return out;
}

export const ema = (src, length) => seededMA(src, length, 2 / (length + 1));
export const rma = (src, length) => seededMA(src, length, 1 / length);

export function rsi(src, length) {
  const up = new Array(src.length).fill(NaN);
  const down = new Array(src.length).fill(NaN);
  for (let i = 1; i < src.length; i++) {
    const ch = src[i] - src[i - 1];
    up[i] = Math.max(ch, 0);
    down[i] = Math.max(-ch, 0);
  }
  const ru = rma(up, length);
  const rd = rma(down, length);
  return ru.map((u, i) => {
    const d = rd[i];
    if (!isNum(u) || !isNum(d)) return NaN;
    if (d === 0) return 100;
    if (u === 0) return 0;
    return 100 - 100 / (1 + u / d);
  });
}

export function macd(src, fast, slow, signal) {
  const f = ema(src, fast);
  const s = ema(src, slow);
  const line = f.map((v, i) => v - s[i]);
  const sig = ema(line, signal);
  const hist = line.map((v, i) => v - sig[i]);
  return { line, signal: sig, hist };
}

export function stdev(src, length) {
  const mean = sma(src, length);
  return src.map((_, i) => {
    if (!isNum(mean[i])) return NaN;
    let s = 0;
    for (let j = i - length + 1; j <= i; j++) s += (src[j] - mean[i]) ** 2;
    return Math.sqrt(s / length);
  });
}

export function bb(src, length, mult) {
  const middle = sma(src, length);
  const dev = stdev(src, length);
  return {
    middle,
    upper: middle.map((m, i) => m + mult * dev[i]),
    lower: middle.map((m, i) => m - mult * dev[i]),
  };
}

export function trueRange(high, low, close) {
  return high.map((h, i) =>
    i === 0
      ? h - low[i]
      : Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1]))
  );
}

export function atr(high, low, close, length) {
  return rma(trueRange(high, low, close), length);
}

function highest(src, length) {
  return src.map((_, i) => (i < length - 1 ? NaN : Math.max(...src.slice(i - length + 1, i + 1))));
}
function lowest(src, length) {
  return src.map((_, i) => (i < length - 1 ? NaN : Math.min(...src.slice(i - length + 1, i + 1))));
}

export function stoch(close, high, low, kLength, kSmooth, dSmooth) {
  const hh = highest(high, kLength);
  const ll = lowest(low, kLength);
  const raw = close.map((c, i) => {
    const range = hh[i] - ll[i];
    if (!isNum(range)) return NaN;
    return range === 0 ? NaN : (100 * (c - ll[i])) / range;
  });
  const k = sma(raw, kSmooth);
  const d = sma(k, dSmooth);
  return { k, d };
}
