import { INTERVALS } from "./catalog.js";

export const QUICK_SYMBOLS = {
  crypto: ["BTCUSDT", "ETHUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT"],
  stocks: ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "TSLA"],
};

// Load candles for a strategy/data-source description using an API client.
export async function loadCandles(api, ds) {
  if (ds.market === "csv") {
    if (!ds.csvCandles?.length) throw new Error("Upload a CSV file first");
    return ds.csvCandles;
  }
  const bars = Math.min(5000, Math.max(50, Number(ds.bars) || 1000));
  const d = await api.getCandles({ market: ds.market, symbol: ds.symbol, interval: ds.interval, bars });
  return d.candles;
}

export function tradingViewUrl({ market, symbol, interval }) {
  const tv = INTERVALS.find((i) => i.key === interval)?.tv ?? "D";
  const sym = market === "crypto" ? `BINANCEUS:${symbol}` : symbol;
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(sym)}&interval=${tv}`;
}

export const isIntraday = (candles) => candles?.length > 1 && candles[1].time - candles[0].time < 86400;
