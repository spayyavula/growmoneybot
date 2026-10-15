// Historical OHLCV candles from the data providers, shared by the market route and the
// marketplace (which fetches its own data so published results can't be fed doctored prices).
export const MAX_BARS = 5000;
export const INTERVAL_SECONDS = { "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800 };

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function fetchJson(url, options) {
  const res = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { message: text.slice(0, 200) }; }
  if (!res.ok) {
    const msg = body?.msg || body?.message || `Data provider error (${res.status})`;
    throw new HttpError(res.status === 429 ? 429 : 502, msg);
  }
  return body;
}

// ---- Crypto: Binance.US public klines (no API key) ------------------------
async function cryptoCandles(symbol, interval, bars) {
  const base = process.env.CRYPTO_API_BASE || "https://api.binance.us";
  const out = [];
  let endTime;
  while (out.length < bars) {
    const limit = Math.min(1000, bars - out.length);
    const url = new URL("/api/v3/klines", base);
    url.search = new URLSearchParams({ symbol, interval, limit: String(limit), ...(endTime && { endTime: String(endTime) }) });
    const rows = await fetchJson(url);
    if (!Array.isArray(rows) || rows.length === 0) break;
    const page = rows.map((k) => ({
      time: Math.floor(k[0] / 1000), open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
    }));
    out.unshift(...page);
    endTime = rows[0][0] - 1;
    if (rows.length < limit) break;
  }
  return out;
}

// ---- Stocks: Alpaca Market Data v2 (needs free API keys) ------------------
const ALPACA_TF = { "15m": "15Min", "1h": "1Hour", "4h": "4Hour", "1d": "1Day", "1w": "1Week" };

async function stockCandles(symbol, interval, bars) {
  const key = process.env.ALPACA_API_KEY;
  const secret = process.env.ALPACA_API_SECRET;
  if (!key || !secret) throw new HttpError(501, "Stock data isn't configured yet (missing ALPACA_API_KEY / ALPACA_API_SECRET)");

  // Look back far enough to cover `bars` trading periods (markets close nights/weekends)
  const sessionFactor = interval === "1d" || interval === "1w" ? 1.5 : 5;
  const start = new Date(Date.now() - INTERVAL_SECONDS[interval] * 1000 * bars * sessionFactor - 7 * 86400000);
  const end = new Date(Date.now() - 16 * 60 * 1000); // free plans can't query the latest 15 minutes

  const out = [];
  let pageToken;
  do {
    const url = new URL("https://data.alpaca.markets/v2/stocks/bars");
    url.search = new URLSearchParams({
      symbols: symbol,
      timeframe: ALPACA_TF[interval],
      start: start.toISOString(),
      end: end.toISOString(),
      limit: String(Math.min(10000, bars - out.length)),
      adjustment: "all",
      feed: process.env.ALPACA_FEED || "iex",
      sort: "desc",
      ...(pageToken && { page_token: pageToken }),
    });
    const body = await fetchJson(url, { headers: { "APCA-API-KEY-ID": key, "APCA-API-SECRET-KEY": secret } });
    const rows = body?.bars?.[symbol] || [];
    for (const b of rows) {
      out.push({ time: Math.floor(Date.parse(b.t) / 1000), open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v });
    }
    pageToken = body?.next_page_token;
  } while (pageToken && out.length < bars);

  return out.reverse(); // oldest first
}


/** Candles oldest first: [{ time (unix s), open, high, low, close, volume }] */
export async function getCandles({ market, symbol, interval, bars, completeOnly = false }) {
  if (!/^[A-Z0-9.\-]{1,20}$/.test(symbol)) throw new HttpError(400, "Invalid symbol");
  if (!INTERVAL_SECONDS[interval]) throw new HttpError(400, "Invalid interval");
  const n = Math.min(MAX_BARS, Math.max(50, Math.floor(bars) || 1000));
  const candles = market === "stocks" ? await stockCandles(symbol, interval, n) : await cryptoCandles(symbol, interval, n);
  // Marketplace results drop the still-forming bar so a recorded result can't change later
  if (completeOnly) {
    const now = Math.floor(Date.now() / 1000);
    while (candles.length && candles[candles.length - 1].time + INTERVAL_SECONDS[interval] > now) candles.pop();
  }
  return candles;
}
