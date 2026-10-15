import { Router } from "express";
import { requireAuth, wrap } from "../auth.js";
import { MAX_BARS, INTERVAL_SECONDS, HttpError, getCandles } from "../marketData.js";

// Historical OHLCV candles for backtesting.
//   GET /api/market/candles?market=crypto|stocks&symbol=BTCUSDT&interval=1d&bars=1000
// Returns: { ok, candles: [{ time (unix s), open, high, low, close, volume }] } oldest first.
const router = Router();
router.use(requireAuth);

router.get("/candles", wrap(async (req, res) => {
  const market = req.query.market === "stocks" ? "stocks" : "crypto";
  const symbol = String(req.query.symbol || "").toUpperCase().trim();
  const interval = String(req.query.interval || "1d");
  const bars = Math.min(MAX_BARS, Math.max(50, parseInt(req.query.bars, 10) || 1000));

  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) return res.status(400).json({ ok: false, error: "Invalid symbol" });
  if (!INTERVAL_SECONDS[interval]) return res.status(400).json({ ok: false, error: "Invalid interval" });

  try {
    const candles = await getCandles({ market, symbol, interval, bars });
    if (!candles.length) return res.status(404).json({ ok: false, error: `No data found for ${symbol}` });
    res.set("Cache-Control", "private, max-age=60");
    res.json({ ok: true, market, symbol, interval, candles });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message });
    if (err.name === "TimeoutError") return res.status(504).json({ ok: false, error: "Data provider timed out" });
    throw err;
  }
}));

export default router;
