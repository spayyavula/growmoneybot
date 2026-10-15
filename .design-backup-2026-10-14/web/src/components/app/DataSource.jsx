import { useRef, useState } from "react";
import { INTERVALS, QUICK_SYMBOLS, parseCandlesCsv } from "@gmb/core";

/** Market / symbol / interval / history selector, plus CSV upload. */
export default function DataSource({ value, onChange }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const fileRef = useRef(null);
  const [csvMsg, setCsvMsg] = useState("");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const candles = parseCandlesCsv(await file.text());
      set({ csvCandles: candles, symbol: file.name.replace(/\.[^.]+$/, "").slice(0, 20).toUpperCase() });
      setCsvMsg(`${candles.length} bars loaded from ${file.name}`);
    } catch (err) {
      setCsvMsg(err.message);
    }
  };

  return (
    <div className="datasource">
      <div className="seg" role="tablist" aria-label="Market">
        {[["crypto", "Crypto"], ["stocks", "Stocks"], ["csv", "CSV"]].map(([k, label]) => (
          <button type="button" key={k} className={value.market === k ? "on" : ""} onClick={() => set({ market: k, symbol: QUICK_SYMBOLS[k]?.[0] ?? value.symbol })}>
            {label}
          </button>
        ))}
      </div>

      {value.market === "csv" ? (
        <div className="csv-box">
          <button type="button" className="btn btn-ghost btn-small" onClick={() => fileRef.current?.click()}>Choose CSV file</button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={onFile} />
          <p className="muted tiny" style={{ margin: 0 }}>
            Columns: time (or date), open, high, low, close, volume. TradingView's "Export chart data" file works. CSV data isn't saved to your account.
          </p>
          {csvMsg && <p className="small" style={{ margin: 0 }}>{csvMsg}</p>}
        </div>
      ) : (
        <>
          <div className="chips" aria-label="Popular symbols">
            {QUICK_SYMBOLS[value.market].map((s) => (
              <button type="button" key={s} className={`chip ${value.symbol === s ? "on" : ""}`} onClick={() => set({ symbol: s })}>{s}</button>
            ))}
          </div>
          <div className="row-3">
            <label className="field">
              <span>Symbol</span>
              <input
                value={value.symbol} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                onChange={(e) => set({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, "") })}
                placeholder={value.market === "crypto" ? "BTCUSDT" : "AAPL"}
              />
            </label>
            <label className="field">
              <span>Timeframe</span>
              <select value={value.interval} onChange={(e) => set({ interval: e.target.value })}>
                {INTERVALS.map((i) => <option key={i.key} value={i.key}>{i.label}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Bars of history</span>
              <input type="number" inputMode="numeric" min={50} max={5000} step={50} value={value.bars} onChange={(e) => set({ bars: e.target.value === "" ? "" : Number(e.target.value) })} />
            </label>
          </div>
        </>
      )}
    </div>
  );
}
