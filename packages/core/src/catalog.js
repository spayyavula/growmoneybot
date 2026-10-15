// Operands a strategy condition can use. Each has editable params and,
// for multi-output indicators, a list of `fields`.

export const SOURCES = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"];

export const OPERANDS = {
  price: { label: "Price", overlay: true, params: [{ key: "source", label: "Source", type: "source", default: "close" }] },
  value: { label: "Number", params: [{ key: "value", label: "Value", type: "number", default: 50 }] },
  sma: {
    label: "SMA", overlay: true,
    params: [
      { key: "source", label: "Source", type: "source", default: "close" },
      { key: "length", label: "Length", type: "int", default: 20, min: 1, max: 500 },
    ],
  },
  ema: {
    label: "EMA", overlay: true,
    params: [
      { key: "source", label: "Source", type: "source", default: "close" },
      { key: "length", label: "Length", type: "int", default: 20, min: 1, max: 500 },
    ],
  },
  rsi: {
    label: "RSI", pane: "RSI",
    params: [
      { key: "source", label: "Source", type: "source", default: "close" },
      { key: "length", label: "Length", type: "int", default: 14, min: 2, max: 200 },
    ],
  },
  macd: {
    label: "MACD", pane: "MACD",
    fields: [{ key: "line", label: "MACD line" }, { key: "signal", label: "Signal line" }, { key: "hist", label: "Histogram" }],
    params: [
      { key: "source", label: "Source", type: "source", default: "close" },
      { key: "fast", label: "Fast", type: "int", default: 12, min: 1, max: 200 },
      { key: "slow", label: "Slow", type: "int", default: 26, min: 2, max: 400 },
      { key: "signal", label: "Signal", type: "int", default: 9, min: 1, max: 200 },
    ],
  },
  bb: {
    label: "Bollinger Bands", overlay: true,
    fields: [{ key: "upper", label: "Upper" }, { key: "middle", label: "Basis" }, { key: "lower", label: "Lower" }],
    params: [
      { key: "source", label: "Source", type: "source", default: "close" },
      { key: "length", label: "Length", type: "int", default: 20, min: 2, max: 500 },
      { key: "mult", label: "StdDev", type: "number", default: 2, min: 0.1, max: 10 },
    ],
  },
  atr: {
    label: "ATR", pane: "ATR",
    params: [{ key: "length", label: "Length", type: "int", default: 14, min: 1, max: 200 }],
  },
  stoch: {
    label: "Stochastic", pane: "Stoch",
    fields: [{ key: "k", label: "%K" }, { key: "d", label: "%D" }],
    params: [
      { key: "kLength", label: "%K length", type: "int", default: 14, min: 1, max: 200 },
      { key: "kSmooth", label: "%K smoothing", type: "int", default: 3, min: 1, max: 50 },
      { key: "dSmooth", label: "%D smoothing", type: "int", default: 3, min: 1, max: 50 },
    ],
  },
  volume: { label: "Volume", pane: "Volume", params: [] },
};

export const OPERATORS = [
  { key: "crossesAbove", label: "crosses above" },
  { key: "crossesBelow", label: "crosses below" },
  { key: ">", label: ">" },
  { key: "<", label: "<" },
  { key: ">=", label: "≥" },
  { key: "<=", label: "≤" },
];

export const INTERVALS = [
  { key: "15m", label: "15 min", tv: "15", barsPerYear: 365 * 96 },
  { key: "1h", label: "1 hour", tv: "60", barsPerYear: 365 * 24 },
  { key: "4h", label: "4 hours", tv: "240", barsPerYear: 365 * 6 },
  { key: "1d", label: "1 day", tv: "D", barsPerYear: 365 },
  { key: "1w", label: "1 week", tv: "W", barsPerYear: 52 },
];

export function makeOperand(type = "price") {
  const def = OPERANDS[type];
  const params = Object.fromEntries(def.params.map((p) => [p.key, p.default]));
  return { type, params, field: def.fields ? def.fields[0].key : undefined };
}

export function operandLabel(op) {
  const def = OPERANDS[op.type];
  if (!def) return "?";
  if (op.type === "value") return String(op.params.value);
  if (op.type === "price") return op.params.source;
  if (op.type === "volume") return "Volume";
  const args = def.params.filter((p) => p.type !== "source").map((p) => op.params[p.key]);
  const src = op.params.source && op.params.source !== "close" ? `${op.params.source}, ` : "";
  const field = def.fields ? ` ${def.fields.find((f) => f.key === op.field)?.label}` : "";
  return `${def.label}(${src}${args.join(", ")})${field}`;
}

// Coerce every parameter to a valid number within its allowed range.
export function normalizeStrategy(s) {
  const clamp = (v, lo, hi, d) => {
    const n = Number(v);
    if (v === "" || !Number.isFinite(n)) return d;
    return Math.min(hi ?? Infinity, Math.max(lo ?? -Infinity, n));
  };
  const fixOperand = (op) => {
    const def = OPERANDS[op?.type] ? OPERANDS[op.type] : OPERANDS.price;
    const type = OPERANDS[op?.type] ? op.type : "price";
    const params = {};
    for (const p of def.params) {
      const v = op?.params?.[p.key];
      if (p.type === "source") params[p.key] = SOURCES.includes(v) ? v : p.default;
      else if (p.type === "int") params[p.key] = Math.round(clamp(v, p.min, p.max, p.default));
      else params[p.key] = clamp(v, p.min, p.max, p.default);
    }
    const field = def.fields ? (def.fields.some((f) => f.key === op?.field) ? op.field : def.fields[0].key) : undefined;
    return field ? { type, params, field } : { type, params };
  };
  const fixGroup = (g) => ({
    logic: g?.logic === "any" ? "any" : "all",
    conditions: (g?.conditions || []).map((c) => ({ left: fixOperand(c.left), op: c.op, right: fixOperand(c.right) })),
  });
  const r = s.risk || {};
  return {
    ...s,
    bars: Math.round(clamp(s.bars, 50, 5000, 1000)),
    entry: fixGroup(s.entry),
    exit: fixGroup(s.exit),
    risk: {
      initialCapital: clamp(r.initialCapital, 1, 1e12, 10000),
      positionSizePct: clamp(r.positionSizePct, 1, 100, 95),
      feePct: clamp(r.feePct, 0, 10, 0.1),
      stopLossPct: clamp(r.stopLossPct, 0, 100, 0),
      takeProfitPct: clamp(r.takeProfitPct, 0, 1000, 0),
    },
  };
}

export function defaultStrategy() {
  return {
    name: "EMA crossover",
    description: "",
    market: "crypto",
    symbol: "BTCUSDT",
    interval: "1d",
    bars: 1000,
    direction: "long",
    entry: {
      logic: "all",
      conditions: [
        { left: { type: "ema", params: { source: "close", length: 20 } }, op: "crossesAbove", right: { type: "ema", params: { source: "close", length: 50 } } },
      ],
    },
    exit: {
      logic: "any",
      conditions: [
        { left: { type: "ema", params: { source: "close", length: 20 } }, op: "crossesBelow", right: { type: "ema", params: { source: "close", length: 50 } } },
      ],
    },
    risk: { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 0, takeProfitPct: 0 },
  };
}

export const TEMPLATES = [
  { name: "EMA crossover", build: () => defaultStrategy() },
  {
    name: "RSI oversold bounce",
    build: () => ({
      ...defaultStrategy(),
      name: "RSI oversold bounce",
      entry: { logic: "all", conditions: [{ left: { type: "rsi", params: { source: "close", length: 14 } }, op: "crossesAbove", right: { type: "value", params: { value: 30 } } }] },
      exit: { logic: "any", conditions: [{ left: { type: "rsi", params: { source: "close", length: 14 } }, op: "crossesAbove", right: { type: "value", params: { value: 70 } } }] },
      risk: { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 5, takeProfitPct: 0 },
    }),
  },
  {
    name: "MACD + trend filter",
    build: () => ({
      ...defaultStrategy(),
      name: "MACD + trend filter",
      entry: {
        logic: "all",
        conditions: [
          { left: { type: "macd", params: { source: "close", fast: 12, slow: 26, signal: 9 }, field: "line" }, op: "crossesAbove", right: { type: "macd", params: { source: "close", fast: 12, slow: 26, signal: 9 }, field: "signal" } },
          { left: { type: "price", params: { source: "close" } }, op: ">", right: { type: "sma", params: { source: "close", length: 200 } } },
        ],
      },
      exit: { logic: "any", conditions: [{ left: { type: "macd", params: { source: "close", fast: 12, slow: 26, signal: 9 }, field: "line" }, op: "crossesBelow", right: { type: "macd", params: { source: "close", fast: 12, slow: 26, signal: 9 }, field: "signal" } }] },
    }),
  },
  {
    name: "Bollinger Band reversion",
    build: () => ({
      ...defaultStrategy(),
      name: "Bollinger Band reversion",
      entry: { logic: "all", conditions: [{ left: { type: "price", params: { source: "close" } }, op: "crossesBelow", right: { type: "bb", params: { source: "close", length: 20, mult: 2 }, field: "lower" } }] },
      exit: { logic: "any", conditions: [{ left: { type: "price", params: { source: "close" } }, op: "crossesAbove", right: { type: "bb", params: { source: "close", length: 20, mult: 2 }, field: "middle" } }] },
      risk: { initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 8, takeProfitPct: 0 },
    }),
  },
];
