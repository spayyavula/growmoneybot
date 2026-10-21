import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  DESCRIBE_EXAMPLES, loadCandles, runBacktest, generatePine, normalizeStrategy, strategyChartSeries, tradeMarkers,
  tradingViewUrl, isIntraday, fmt,
} from "@gmb/core";
import * as api from "../api.js";
import PriceChart, { EquityChart } from "../components/app/PriceChart.jsx";
import { MetricsGrid, TradesTable } from "../components/app/Results.jsx";
import CostCheck from "../components/app/CostCheck.jsx";
import { RulesView } from "../components/market/parts.jsx";

export default function DescribeStrategy() {
  const navigate = useNavigate();
  const box = useRef(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState({ state: "idle", msg: "" });
  const [read, setRead] = useState(null); // response from /api/describe
  const [run, setRun] = useState(null);
  const [tab, setTab] = useState("backtest");
  const [copied, setCopied] = useState(false);

  const strategy = read?.strategy;
  const pine = useMemo(() => (strategy ? generatePine(normalizeStrategy(strategy), { strategyId: "" }) : ""), [strategy]);
  const chart = useMemo(() => (run ? { ...strategyChartSeries(run.candles, run.strategy), markers: tradeMarkers(run.result.trades, run.result.openTrade) } : null), [run]);

  const build = async () => {
    if (text.trim().length < 10) return setStatus({ state: "error", msg: "Describe when to buy and when to sell, in a sentence or two." });
    setStatus({ state: "loading", msg: "Reading your description…" });
    setRun(null);
    try {
      const d = await api.api.describeStrategy({ text, ...(strategy && { market: strategy.market, symbol: strategy.symbol, interval: strategy.interval }) });
      setRead(d);
      setTab("backtest");
      setStatus({ state: "idle", msg: "" });
    } catch (e) {
      setStatus({ state: "error", msg: e.message });
    }
  };

  // Backtest whatever was read
  useEffect(() => {
    if (!read?.understood) return undefined;
    let live = true;
    setStatus({ state: "loading", msg: `Testing on ${fmt.num(read.strategy.bars, 0)} candles of ${read.strategy.symbol}…` });
    loadCandles(api.api, read.strategy)
      .then((candles) => {
        if (!live) return;
        setRun({ candles, result: runBacktest(candles, read.strategy), strategy: read.strategy });
        setStatus({ state: "idle", msg: "" });
      })
      .catch((e) => live && setStatus({ state: "error", msg: e.message }));
    return () => { live = false; };
  }, [read]);

  const save = async () => {
    setStatus({ state: "loading", msg: "Saving…" });
    try {
      const d = await api.createStrategy({ ...strategy, instrument: "shares" });
      if (run) await api.saveBacktestSummary(d.strategy._id, run.result.metrics).catch(() => {});
      navigate(`/app/strategies/${d.strategy._id}`);
    } catch (e) {
      setStatus({ state: "error", msg: e.message });
    }
  };

  const copyPine = async () => {
    try { await navigator.clipboard.writeText(pine); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };

  const busy = status.state === "loading";

  return (
    <div className="describe">
      <Link to="/app" className="muted small">← Strategies</Link>
      <div className="describe-head">
        <h1>Describe a strategy</h1>
        <p className="muted">Write your rules the way you'd explain them to a friend. GrowMoneyBot turns them into a strategy, backtests it, and writes the Pine Script for TradingView.</p>
      </div>

      <section className="panel describe-input">
        <label className="field" htmlFor="describe-text">
          <span>When should it buy, and when should it sell?</span>
        </label>
        <textarea
          id="describe-text" ref={box} rows={5} maxLength={1500} value={text} disabled={busy}
          placeholder="e.g. Buy Bitcoin on the 1h chart when RSI crosses above 30 and price is above the 200 EMA. Sell when RSI goes above 70. 3% stop loss."
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) build(); }}
        />
        <div className="describe-examples">
          <span className="muted tiny">Try an example:</span>
          {DESCRIBE_EXAMPLES.map((ex, i) => (
            <button type="button" key={ex} className="chip" onClick={() => setText(ex)} title={ex}>{["BTC RSI dip", "SPY EMA cross", "ETH breakout", "QQQ MACD"][i] ?? `Example ${i + 1}`}</button>
          ))}
        </div>
        <div className="describe-actions">
          <button type="button" className="btn" onClick={build} disabled={busy}>{read ? "Rebuild" : "Build it"}</button>
          <span className="muted tiny">Mention the symbol and timeframe, when to buy, when to sell, and any stop loss or target.</span>
        </div>
      </section>

      {status.msg && <p className={`form-msg ${status.state}`} role="status">{status.msg}</p>}

      {read && !read.understood && (
        <section className="panel">
          <h2 className="describe-h2">No buy rule found</h2>
          <p className="small">GrowMoneyBot needs at least one condition based on price or an indicator, like "when RSI crosses above 30" or "when the 20 EMA crosses above the 50 EMA".</p>
          {read.unsupported?.length > 0 && <ul className="describe-list warn">{read.unsupported.map((u) => <li key={u}>{u}</li>)}</ul>}
          {read.note && <p className="muted tiny">{read.note}</p>}
        </section>
      )}

      {read?.understood && (
        <div className="describe-grid">
          <section className="panel">
            <h2 className="describe-h2">How it was read</h2>
            <p className="muted tiny">{read.source === "claude" ? "Translated by Claude." : "Read by the built-in parser."} Check these rules match what you meant.</p>
            {read.note && <p className="note tiny">{read.note}</p>}
            <RulesView rules={strategy} />
            {read.assumptions?.length > 0 && (
              <>
                <h4>Filled in for you</h4>
                <ul className="describe-list">{read.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
              </>
            )}
            {read.unsupported?.length > 0 && (
              <>
                <h4>Left out</h4>
                <ul className="describe-list warn">{read.unsupported.map((u) => <li key={u}>{u}</li>)}</ul>
              </>
            )}
            <div className="describe-actions">
              <button type="button" className="btn" onClick={save} disabled={busy}>Save and open in the builder</button>
              <button type="button" className="btn btn-ghost" onClick={() => box.current?.focus()}>Edit the description</button>
            </div>
          </section>

          <section className="panel">
            <div className="tabs" role="tablist">
              <button role="tab" aria-selected={tab === "backtest"} className={tab === "backtest" ? "on" : ""} onClick={() => setTab("backtest")}>Backtest</button>
              <button role="tab" aria-selected={tab === "pine"} className={tab === "pine" ? "on" : ""} onClick={() => setTab("pine")}>Pine Script</button>
            </div>
            {tab === "backtest" && (run ? (
              <div className="results">
                <p className="muted small run-meta">
                  {run.strategy.symbol} · {run.strategy.interval} · {run.candles.length} bars · {fmt.date(run.candles[0].time)} → {fmt.date(run.candles[run.candles.length - 1].time)} · starting with {fmt.money(run.strategy.risk.initialCapital)}
                </p>
                <MetricsGrid m={run.result.metrics} />
                <CostCheck m={run.result.metrics} settlement={run.result.settlement} strategy={run.strategy} />
                <PriceChart candles={run.candles} overlays={chart.overlays} panes={chart.panes} markers={chart.markers} />
                <h4>Equity</h4>
                <EquityChart equity={run.result.equity} />
                <h4>Trades</h4>
                <TradesTable trades={run.result.trades} openTrade={run.result.openTrade} intraday={isIntraday(run.candles)} />
                <p className="muted tiny">Results are hypothetical and based on past prices.</p>
              </div>
            ) : <p className="muted">{busy ? "Running the backtest…" : "The backtest appears here."}</p>)}
            {tab === "pine" && (
              <div className="pine-tab">
                <p className="small" style={{ marginTop: 0 }}>
                  Pine Script v6 with exactly the rules, sizing, fees and stop/target the backtest used. Paste it into TradingView's Pine Editor and click <b>Add to chart</b>.
                </p>
                <div className="code-actions">
                  <button className="btn btn-small" onClick={copyPine}>{copied ? "Copied!" : "Copy Pine Script"}</button>
                  <a className="btn btn-ghost btn-small" href={tradingViewUrl(strategy)} target="_blank" rel="noreferrer">Open {strategy.symbol} on TradingView ↗</a>
                </div>
                <pre className="code"><code>{pine}</code></pre>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
