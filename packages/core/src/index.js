// Shared, platform-neutral code (no DOM, no React, no Node APIs).
export * as indicators from "./indicators.js";
export * from "./catalog.js";
export { computeOperand, operandKey, ruleSeries, sourceSeries } from "./evaluate.js";
export { runBacktest, computeMetrics, tradingDay, settlementSummary } from "./backtest.js";
export {
  ENGINE_VERSION, LIVE_WARMUP_BARS, MIN_VERIFIED_TRADES, canonicalJson, sha256Hex, strategySpec, candleRows, rowsToCandles,
  receiptMetrics, metricsMatch, downsample, slimTrades, verifyBacktest, receiptHashOf, livePerformance, liveEvents,
} from "./verify.js";
export {
  OPTION_DEFAULTS, normalizeOptions, bsPrice, bsDelta, normCdf, normInv, strikeForDelta, strikeStep, expiryFor,
  realizedVolSeries, buildStructure, priceStructure, payoffAtExpiry, structureRisk, runOptionsBacktest,
} from "./options.js";
export { etOffsetHours, etCloseTime } from "./marketTime.js";
export { GUIDED_PACES, GUIDED_STYLES, GUIDED_RISK, MARGIN_MINIMUM, buildGuidedStrategy } from "./guided.js";
export { generatePine } from "./pine.js";
export { createApi, webhookUrl } from "./api.js";
export { loadCandles, tradingViewUrl, isIntraday, QUICK_SYMBOLS } from "./candles.js";
export { strategyChartSeries, tradeMarkers } from "./chartData.js";
export { parseCandlesCsv } from "./csv.js";
export * as fmt from "./format.js";
