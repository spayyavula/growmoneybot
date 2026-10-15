// Parse an OHLCV CSV (e.g. a TradingView "Export chart data" file) into candles.
// Needs columns for time/date and open, high, low, close; volume is optional.
export function parseCandlesCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("The CSV file looks empty");

  const split = (line) => line.split(/[,;\t]/).map((s) => s.trim().replace(/^"|"$/g, ""));
  const header = split(lines[0]).map((h) => h.toLowerCase());
  const find = (...names) => header.findIndex((h) => names.includes(h));

  const col = {
    time: find("time", "date", "datetime", "timestamp", "open time", "opentime"),
    open: find("open", "o"),
    high: find("high", "h"),
    low: find("low", "l"),
    close: find("close", "c", "adj close"),
    volume: find("volume", "vol", "v"),
  };
  for (const k of ["time", "open", "high", "low", "close"]) {
    if (col[k] === -1) throw new Error(`CSV is missing a "${k}" column`);
  }

  const parseTime = (v) => {
    if (/^\d+(\.\d+)?$/.test(v)) {
      const n = Number(v);
      return n > 1e12 ? Math.floor(n / 1000) : Math.floor(n); // ms or s
    }
    const t = Date.parse(v.includes("T") || v.includes("Z") || v.length > 10 ? v : `${v}T00:00:00Z`);
    return Number.isNaN(t) ? NaN : Math.floor(t / 1000);
  };

  const seen = new Set();
  const candles = [];
  for (const line of lines.slice(1)) {
    const cells = split(line);
    const c = {
      time: parseTime(cells[col.time]),
      open: Number(cells[col.open]),
      high: Number(cells[col.high]),
      low: Number(cells[col.low]),
      close: Number(cells[col.close]),
      volume: col.volume >= 0 ? Number(cells[col.volume]) || 0 : 0,
    };
    if ([c.time, c.open, c.high, c.low, c.close].some((x) => !Number.isFinite(x))) continue;
    if (seen.has(c.time)) continue;
    seen.add(c.time);
    candles.push(c);
  }
  if (candles.length < 50) throw new Error(`Only ${candles.length} valid rows found — need at least 50`);
  return candles.sort((a, b) => a.time - b.time).slice(-5000);
}
