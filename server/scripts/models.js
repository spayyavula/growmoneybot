// The house "GrowMoneyBot Research" model set: 20 widely used technical trading models,
// published to the marketplace through the same server-side verification experts use.

const op = (type, params = {}, field) => (field ? { type, params, field } : { type, params });
const close = op("price", { source: "close" });
const num = (value) => op("value", { value });
const sma = (length) => op("sma", { source: "close", length });
const ema = (length) => op("ema", { source: "close", length });
const rsi = (length = 14) => op("rsi", { source: "close", length });
const macd = (field, fast = 12, slow = 26, signal = 9) => op("macd", { source: "close", fast, slow, signal }, field);
const bb = (field, length = 20, mult = 2) => op("bb", { source: "close", length, mult }, field);
const stoch = (field) => op("stoch", { kLength: 14, kSmooth: 3, dSmooth: 3 }, field);

const when = (left, o, right) => ({ left, op: o, right });
const all = (...conditions) => ({ logic: "all", conditions });
const any = (...conditions) => ({ logic: "any", conditions });
const risk = (r = {}) => ({ initialCapital: 10000, positionSizePct: 95, feePct: 0.1, stopLossPct: 0, takeProfitPct: 0, ...r });

const crypto = (symbol, interval, bars) => ({ market: "crypto", symbol, interval, bars });
const stock = (symbol, interval = "1d", bars = 2500) => ({ market: "stocks", symbol, interval, bars });

export const MODELS = [
  {
    name: "Golden Cross 50/200 — BTC 4h", ...crypto("BTCUSDT", "4h", 5000),
    summary: "Classic long-term trend filter: buy when the 50 SMA crosses above the 200 SMA, sell on the death cross.",
    tags: ["trend", "moving average", "crypto"],
    entry: all(when(sma(50), "crossesAbove", sma(200))),
    exit: any(when(sma(50), "crossesBelow", sma(200))),
  },
  {
    name: "Golden Cross 50/200 — QQQ 1h", ...stock("QQQ", "1h", 5000),
    summary: "The 50/200 SMA golden cross applied to Nasdaq-100 hourly bars.",
    tags: ["trend", "moving average", "stocks"],
    entry: all(when(sma(50), "crossesAbove", sma(200))),
    exit: any(when(sma(50), "crossesBelow", sma(200))),
  },
  {
    name: "EMA 20/50 Trend — ETH 1d", ...crypto("ETHUSDT", "1d", 2500),
    summary: "Medium-term trend following on Ethereum with a 20/50 EMA crossover.",
    tags: ["trend", "moving average", "crypto"],
    entry: all(when(ema(20), "crossesAbove", ema(50))),
    exit: any(when(ema(20), "crossesBelow", ema(50))),
  },
  {
    name: "EMA 9/21 Swing — BTC 4h", ...crypto("BTCUSDT", "4h", 5000),
    summary: "Fast swing-trading EMA crossover on Bitcoin with a 6% stop.",
    tags: ["swing", "moving average", "crypto"],
    entry: all(when(ema(9), "crossesAbove", ema(21))),
    exit: any(when(ema(9), "crossesBelow", ema(21))),
    risk: risk({ stopLossPct: 6 }),
  },
  {
    name: "200-Day Trend Filter — BTC 1d", ...crypto("BTCUSDT", "1d", 2500),
    summary: "Time-series momentum: hold Bitcoin only while it closes above its 200-day SMA.",
    tags: ["trend", "momentum", "crypto"],
    entry: all(when(close, "crossesAbove", sma(200))),
    exit: any(when(close, "crossesBelow", sma(200))),
  },
  {
    name: "Connors RSI(2) Pullback — SPY 1d", ...stock("SPY"),
    summary: "Buy short-term oversold dips (RSI(2) < 10) in a long-term uptrend; exit on a close above the 5 SMA.",
    tags: ["mean reversion", "rsi", "stocks"],
    entry: all(when(rsi(2), "<", num(10)), when(close, ">", sma(200))),
    exit: any(when(close, ">", sma(5))),
  },
  {
    name: "RSI 30/70 Reversal — QQQ 1h", ...stock("QQQ", "1h", 5000),
    summary: "Textbook RSI on hourly bars: buy when RSI(14) recovers above 30, sell above 70. 4% stop.",
    tags: ["mean reversion", "rsi", "stocks"],
    entry: all(when(rsi(), "crossesAbove", num(30))),
    exit: any(when(rsi(), "crossesAbove", num(70))),
    risk: risk({ stopLossPct: 4 }),
  },
  {
    name: "Uptrend Pullback — QQQ 1d", ...stock("QQQ"),
    summary: "Buy RSI(14) dips below 40 while price holds above the 200 SMA; exit when RSI recovers to 65.",
    tags: ["pullback", "rsi", "stocks"],
    entry: all(when(rsi(), "<", num(40)), when(close, ">", sma(200))),
    exit: any(when(rsi(), ">", num(65))),
    risk: risk({ stopLossPct: 8 }),
  },
  {
    name: "MACD + 200 SMA Filter — SPY 1d", ...stock("SPY"),
    summary: "MACD line crossing its signal, taken only above the 200 SMA.",
    tags: ["momentum", "macd", "stocks"],
    entry: all(when(macd("line"), "crossesAbove", macd("signal")), when(close, ">", sma(200))),
    exit: any(when(macd("line"), "crossesBelow", macd("signal"))),
  },
  {
    name: "MACD Crossover — ETH 4h", ...crypto("ETHUSDT", "4h", 5000),
    summary: "Standard 12/26/9 MACD signal-line crossover on Ethereum 4-hour bars.",
    tags: ["momentum", "macd", "crypto"],
    entry: all(when(macd("line"), "crossesAbove", macd("signal"))),
    exit: any(when(macd("line"), "crossesBelow", macd("signal"))),
    risk: risk({ stopLossPct: 7 }),
  },
  {
    name: "MACD Zero-Line — MSFT 1d", ...stock("MSFT"),
    summary: "Go long when the MACD line crosses above zero, exit when it falls back below.",
    tags: ["momentum", "macd", "stocks"],
    entry: all(when(macd("line"), "crossesAbove", num(0))),
    exit: any(when(macd("line"), "crossesBelow", num(0))),
  },
  {
    name: "Bollinger Reversion — SPY 1d", ...stock("SPY"),
    summary: "Buy a close below the lower Bollinger Band, sell back at the 20-day basis. 8% stop.",
    tags: ["mean reversion", "bollinger", "stocks"],
    entry: all(when(close, "crossesBelow", bb("lower"))),
    exit: any(when(close, "crossesAbove", bb("middle"))),
    risk: risk({ stopLossPct: 8 }),
  },
  {
    name: "Bollinger Breakout — SOL 1d", ...crypto("SOLUSDT", "1d", 2000),
    summary: "Volatility breakout: buy a close above the upper band, exit when price loses the basis.",
    tags: ["breakout", "bollinger", "crypto"],
    entry: all(when(close, "crossesAbove", bb("upper"))),
    exit: any(when(close, "crossesBelow", bb("middle"))),
  },
  {
    name: "Bollinger Reversion — BTC 1h", ...crypto("BTCUSDT", "1h", 5000),
    summary: "Intraday mean reversion on Bitcoin: lower-band buys, basis exits, 3% stop.",
    tags: ["mean reversion", "bollinger", "crypto"],
    entry: all(when(close, "crossesBelow", bb("lower"))),
    exit: any(when(close, "crossesAbove", bb("middle"))),
    risk: risk({ stopLossPct: 3 }),
  },
  {
    name: "Stochastic Oversold Cross — AAPL 1d", ...stock("AAPL"),
    summary: "%K crossing above %D from oversold (below 25); exit when %K tops 80.",
    tags: ["oscillator", "stochastic", "stocks"],
    entry: all(when(stoch("k"), "crossesAbove", stoch("d")), when(stoch("k"), "<", num(25))),
    exit: any(when(stoch("k"), ">", num(80))),
    risk: risk({ stopLossPct: 8 }),
  },
  {
    name: "Triple EMA Stack — NVDA 1d", ...stock("NVDA"),
    summary: "Long when price > EMA 21 > EMA 55 (aligned trend); exit on a close below EMA 55.",
    tags: ["trend", "moving average", "stocks"],
    entry: all(when(close, ">", ema(21)), when(ema(21), "crossesAbove", ema(55))),
    exit: any(when(close, "crossesBelow", ema(55))),
  },
  {
    name: "RSI 50 Momentum — ETH 1d", ...crypto("ETHUSDT", "1d", 2500),
    summary: "Momentum regime switch: RSI(14) crossing 50 while price is above the 50 EMA.",
    tags: ["momentum", "rsi", "crypto"],
    entry: all(when(rsi(), "crossesAbove", num(50)), when(close, ">", ema(50))),
    exit: any(when(rsi(), "crossesBelow", num(45))),
  },
  {
    name: "EMA 12/26 Crossover — SOL 4h", ...crypto("SOLUSDT", "4h", 5000),
    summary: "Fast EMA crossover on Solana 4-hour bars with a 8% stop.",
    tags: ["trend", "moving average", "crypto"],
    entry: all(when(ema(12), "crossesAbove", ema(26))),
    exit: any(when(ema(12), "crossesBelow", ema(26))),
    risk: risk({ stopLossPct: 8 }),
  },
  {
    name: "EMA 50/200 Trend — BTC 1h", ...crypto("BTCUSDT", "1h", 5000),
    summary: "Hourly Bitcoin trend following with the 50/200 EMA pair.",
    tags: ["trend", "moving average", "crypto"],
    entry: all(when(ema(50), "crossesAbove", ema(200))),
    exit: any(when(ema(50), "crossesBelow", ema(200))),
  },
  {
    name: "Overbought Fade (Short) — BTC 4h", ...crypto("BTCUSDT", "4h", 5000), direction: "short",
    summary: "Short Bitcoin bounces in a downtrend: RSI(14) crossing below 60 under the 200 SMA; cover at RSI 35. 5% stop.",
    tags: ["short", "rsi", "crypto"],
    entry: all(when(rsi(), "crossesBelow", num(60)), when(close, "<", sma(200))),
    exit: any(when(rsi(), "<", num(35))),
    risk: risk({ stopLossPct: 5 }),
  },
];

export const toStrategy = (m) => ({
  name: m.name, description: m.summary, market: m.market, symbol: m.symbol, interval: m.interval, bars: m.bars,
  direction: m.direction || "long", entry: m.entry, exit: m.exit, risk: m.risk || risk(),
});
