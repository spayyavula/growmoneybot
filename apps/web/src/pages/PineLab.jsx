import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import * as api from "../api.js";
import { runPine, SAMPLE_PINE } from "../engine/pineRunner.js";
import { loadCandles, tradingViewUrl, tradeMarkers, isIntraday } from "@gmb/core";
import DataSource from "../components/app/DataSource.jsx";
import PriceChart from "../components/app/PriceChart.jsx";
import { MetricsGrid, TradesTable } from "../components/app/Results.jsx";

export default function PineLab() {
  const location = useLocation();
  const [code, setCode] = useState(location.state?.code || SAMPLE_PINE);
  const [name, setName] = useState(location.state?.name || "My script");
  const [scriptId, setScriptId] = useState(null);
  const [scripts, setScripts] = useState([]);
  const [ds, setDs] = useState({ market: "crypto", symbol: "BTCUSDT", interval: "1d", bars: 1000, csvCandles: null });
  const [status, setStatus] = useState({ state: "idle", msg: "" });
  const [out, setOut] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => { api.listPine().then((d) => setScripts(d.scripts)).catch(() => {}); }, []);

  const run = async () => {
    setStatus({ state: "loading", msg: "Loading price data…" });
    try {
      const candles = await loadCandles(api.api, ds);
      setStatus({ state: "loading", msg: "Running Pine Script…" });
      const result = await runPine(code, candles);
      setOut({ candles, ...result });
      setStatus({ state: "idle", msg: "" });
    } catch (e) {
      setStatus({ state: "error", msg: `Error: ${e.message}` });
    }
  };

  const save = async () => {
    try {
      const d = scriptId ? await api.updatePine(scriptId, { name, code }) : await api.createPine({ name, code });
      setScriptId(d.script._id);
      setScripts((xs) => [d.script, ...xs.filter((x) => x._id !== d.script._id)]);
      setStatus({ state: "success", msg: "Saved" });
    } catch (e) { setStatus({ state: "error", msg: e.message }); }
  };

  const open = (id) => {
    if (id === "__new") { setScriptId(null); setName("My script"); setCode(SAMPLE_PINE); setOut(null); return; }
    const sc = scripts.find((x) => x._id === id);
    if (sc) { setScriptId(sc._id); setName(sc.name); setCode(sc.code); setOut(null); }
  };

  const remove = async () => {
    if (!scriptId || !window.confirm(`Delete "${name}"?`)) return;
    try {
      await api.deletePine(scriptId);
      setScripts((xs) => xs.filter((x) => x._id !== scriptId));
      open("__new");
    } catch (e) { setStatus({ state: "error", msg: e.message }); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };

  const chart = useMemo(() => {
    if (!out) return null;
    const markers = [...out.markers, ...(out.strategy ? tradeMarkers(out.strategy.trades) : [])];
    return out.overlay
      ? { overlays: out.lines, panes: [], markers }
      : { overlays: [], panes: out.lines.length ? [{ title: "Script", series: out.lines.map((l) => ({ ...l, type: "line" })) }] : [], markers };
  }, [out]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Pine Lab</h1>
          <p className="muted small">Paste a Pine Script v5/v6 indicator or strategy and run it on real price data.</p>
        </div>
      </div>

      <div className="editor-grid">
        <section className="panel">
          <div className="row-2">
            <label className="field">
              <span>Script</span>
              <select value={scriptId || "__new"} onChange={(e) => open(e.target.value)}>
                <option value="__new">New script</option>
                {scripts.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field"><span>Name</span><input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></label>
          </div>
          <textarea className="code-editor" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} aria-label="Pine Script code" />
          <div className="code-actions">
            <button className="btn" onClick={run} disabled={status.state === "loading"}>Run script</button>
            <button className="btn btn-ghost btn-small" onClick={save}>Save</button>
            <button className="btn btn-ghost btn-small" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
            <a className="btn btn-ghost btn-small" href={tradingViewUrl(ds)} target="_blank" rel="noreferrer">Open on TradingView ↗</a>
            {scriptId && <button className="link-btn danger" onClick={remove}>Delete</button>}
          </div>
          <h3>Data</h3>
          <DataSource value={ds} onChange={setDs} />
          <p className="muted tiny">
            Scripts run in your browser with the open-source PineTS engine. Most built-in functions are supported,
            but results can differ slightly from TradingView. Use TradingView as the source of truth.
          </p>
        </section>

        <section className="panel output">
          {status.msg && <p className={`form-msg ${status.state}`}>{status.msg}</p>}
          {out ? (
            <div className="results">
              {out.warnings.length > 0 && <p className="note warn tiny">{out.warnings.slice(0, 3).map(String).join(" · ")}</p>}
              {out.strategy && <MetricsGrid m={out.strategy.metrics} />}
              <PriceChart candles={out.candles} overlays={chart.overlays} panes={chart.panes} markers={chart.markers} />
              {out.strategy && (<><h4>Trades</h4><TradesTable trades={out.strategy.trades} intraday={isIntraday(out.candles)} /></>)}
            </div>
          ) : (
            <div className="empty">
              <p>Click <b>Run script</b> to plot your script on the chart.</p>
              <p className="muted small">Strategies also show their trades and performance.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
