// Shared, platform-neutral code (no DOM, no React, no Node APIs).
export * as indicators from "./indicators.js";
export * from "./catalog.js";
export { computeOperand, operandKey, ruleSeries, sourceSeries } from "./evaluate.js";
export { runBacktest, computeMetrics } from "./backtest.js";
export { generatePine } from "./pine.js";
export { createApi, webhookUrl } from "./api.js";
export { loadCandles, tradingViewUrl, isIntraday, QUICK_SYMBOLS } from "./candles.js";
export { strategyChartSeries, tradeMarkers } from "./chartData.js";
export { parseCandlesCsv } from "./csv.js";
export * as fmt from "./format.js";
