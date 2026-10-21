import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import {
  defaultStrategy, normalizeStrategy, TEMPLATES, runBacktest, generatePine,
  loadCandles, tradingViewUrl, isIntraday, strategyChartSeries, tradeMarkers, webhookUrl, fmt,
  SMALL_ACCOUNT_PRESETS, applySmallAccountPreset, OPTION_DEFAULTS,
} from "@gmb/core";
import * as api from "../api.js";
import RuleEditor from "../components/app/RuleEditor.jsx";
import DataSource from "../components/app/DataSource.jsx";
import PriceChart, { EquityChart } from "../components/app/PriceChart.jsx";
import { MetricsGrid, TradesTable } from "../components/app/Results.jsx";
import CostCheck from "../components/app/CostCheck.jsx";
import { OptionsPreview, OptionsCostCheck, OptionsTradesTable, EstimateNote } from "../components/app/OptionsResults.jsx";
import { useAuth } from "../lib/auth.jsx";

// Phones show one view at a time; wide screens show the builder beside the output tabs.
const VIEWS = [["rules", "Rules"], ["results", "Results"], ["pine", "Pine Script"], ["alerts", "Alerts"]];

export default function StrategyEditor() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user } = useAuth();

  const [s, setS] = useState(defaultStrategy);
  const [loading, setLoading] = useState(!isNew);
  const [status, setStatus] = useState({ state: "idle", msg: "" });
  const [run, setRun] = useState(null);
  const [view, setView] = useState("rules");
  const [copied, setCopied] = useState(false);
  const [csvCandles, setCsvCandles] = useState(null);

  useEffect(() => {
    if (isNew) return;
    api.getStrategy(id)
      .then((d) => setS({ ...defaultStrategy(), ...d.strategy }))
      .catch((e) => setStatus({ state: "error", msg: e.message }))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const setRisk = (k, v) => setS((prev) => ({ ...prev, risk: { ...prev.risk, [k]: v === "" ? "" : Number(v) } }));
  const setOpt = (k, v) => setS((prev) => ({ ...prev, options: { ...OPTION_DEFAULTS, ...prev.options, [k]: k === "structure" || v === "" ? v : Number(v) } }));
  const isOptions = s.instrument === "options";
  const opt = { ...OPTION_DEFAULTS, ...s.options };
  const outputTab = view === "rules" ? "results" : view; // on wide screens the output panel never shows "rules"

  const pine = useMemo(() => {
    try { return generatePine(normalizeStrategy(s), { strategyId: isNew ? "" : id }); }
    catch (e) { return `// Could not generate Pine Script: ${e.message}`; }
  }, [s, id, isNew]);

  const save = async () => {
    const clean = normalizeStrategy(s);
    // "shares" tells the server to drop options settings when a strategy switches back
    const body = { ...clean, instrument: clean.instrument || "shares", _id: undefined, user: undefined, lastBacktest: undefined };
    setStatus({ state: "loading", msg: "Saving…" });
    try {
      if (isNew) {
        const d = await api.createStrategy(body);
        if (run) await api.saveBacktestSummary(d.strategy._id, run.result.metrics).catch(() => {});
        setStatus({ state: "success", msg: "Saved" });
        navigate(`/app/strategies/${d.strategy._id}`, { replace: true });
      } else {
        await api.updateStrategy(id, body);
        setStatus({ state: "success", msg: "Saved" });
      }
    } catch (e) {
      setStatus({ state: "error", msg: e.message });
    }
  };

  const backtest = async () => {
    const clean = normalizeStrategy(s);
    if (!clean.entry.conditions.length) return setStatus({ state: "error", msg: "Add at least one entry condition" });
    setStatus({ state: "loading", msg: "Loading price data…" });
    try {
      const candles = await loadCandles(api.api, { ...clean, csvCandles });
      setStatus({ state: "loading", msg: "Running backtest…" });
      await new Promise((r) => setTimeout(r, 0));
      const result = runBacktest(candles, clean);
      setRun({ candles, result, strategy: clean });
      setView("results");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setStatus({ state: "idle", msg: "" });
      if (!isNew) api.saveBacktestSummary(id, result.metrics).catch(() => {});
    } catch (e) {
      setStatus({ state: "error", msg: e.message });
    }
  };

  const chart = useMemo(() => {
    if (!run) return null;
    return { ...strategyChartSeries(run.candles, run.strategy), markers: tradeMarkers(run.result.trades, run.result.openTrade) };
  }, [run]);

  const copyPine = async () => {
    try { await navigator.clipboard.writeText(pine); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* clipboard blocked */ }
  };
  const sharePine = async () => {
    try { await navigator.share({ title: `${s.name} (Pine Script)`, text: pine }); } catch { /* cancelled */ }
  };

  if (loading) return <div className="page-loading">Loading strategy…</div>;

  const shortMarginWarning = s.direction === "short" && Number(s.risk.positionSizePct) > 50;
  const cashShort = s.market === "stocks" && s.account === "cash" && s.direction === "short";
  const presets = SMALL_ACCOUNT_PRESETS.filter((p) => s.market === "csv" || p.market === s.market);
  const applyPreset = (key) => {
    const p = SMALL_ACCOUNT_PRESETS.find((x) => x.key === key);
    setS((prev) => applySmallAccountPreset(prev, key));
    setStatus({ state: "success", msg: `Applied "${p.label}". ${p.note}` });
  };
  const busy = status.state === "loading";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  return (
    <div className="editor" data-view={view}>
      <div className="editor-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link to="/app" className="muted small">← Strategies</Link>
          <input className="title-input" value={s.name} maxLength={80} onChange={(e) => set({ name: e.target.value })} aria-label="Strategy name" />
        </div>
        {isNew && (
          <select
            className="template-pick" defaultValue="" aria-label="Start from a template"
            onChange={(e) => { const t = TEMPLATES[Number(e.target.value)]; if (t) { setS(t.build()); setRun(null); } e.target.value = ""; }}
          >
            <option value="" disabled>Start from a template…</option>
            {TEMPLATES.map((t, i) => <option key={t.name} value={i}>{t.name}</option>)}
          </select>
        )}
        <div className="head-actions">
          {!isNew && user?.expert?.status === "approved" && s.market !== "csv" && (
            <Link to={`/app/experts?publish=${id}`} className="btn btn-plain">Publish…</Link>
          )}
          <button className="btn btn-ghost" onClick={save} disabled={busy}>Save</button>
          <button className="btn" onClick={backtest} disabled={busy}>Run backtest</button>
        </div>
      </div>

      <div className="view-tabs" role="tablist">
        {VIEWS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={view === k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{label}</button>
        ))}
      </div>

      {status.msg && <p className={`form-msg ${status.state}`} role="status">{status.msg}</p>}

      <div className="editor-grid">
        <section className="panel builder">
          <h3>Market</h3>
          <DataSource
            value={{ ...s, csvCandles }}
            onChange={(v) => {
              setCsvCandles(v.csvCandles ?? null);
              set({ market: v.market, symbol: v.symbol, interval: v.interval, bars: v.bars, ...(v.market === "crypto" && { instrument: undefined }) });
            }}
          />

          {s.market !== "crypto" && (
            <>
              <h3>Trade as</h3>
              <div className="seg" role="radiogroup" aria-label="Trade as">
                {[["shares", "Shares"], ["options", "Options"]].map(([k, label]) => (
                  <button type="button" key={k} role="radio" aria-checked={(isOptions ? "options" : "shares") === k} className={(isOptions ? "options" : "shares") === k ? "on" : ""}
                    onClick={() => set(k === "options" ? { instrument: "options", options: { ...OPTION_DEFAULTS, ...s.options } } : { instrument: undefined })}>{label}</button>
                ))}
              </div>
              {isOptions && <p className="muted tiny">The rules run on the stock; each trade opens an options position. Long buys calls, short buys puts.</p>}
            </>
          )}

          <h3>Direction</h3>
          <div className="seg">
            {[["long", "Long"], ["short", "Short"]].map(([k, label]) => (
              <button type="button" key={k} className={s.direction === k ? "on" : ""} onClick={() => set({ direction: k })}>{label}</button>
            ))}
          </div>

          <RuleEditor title="Entry rules" hint="Checked at each bar's close. Orders fill at the next bar's open." group={s.entry} onChange={(entry) => set({ entry })} />
          <RuleEditor title="Exit rules" hint="Leave empty to exit only with the stop loss or take profit." group={s.exit} onChange={(exit) => set({ exit })} />

          <h3>Risk &amp; costs</h3>
          {isOptions ? (
            <>
              <div className="seg" role="radiogroup" aria-label="Options position">
                {[["spread", s.direction === "short" ? "Bear put spread" : "Bull call spread"], ["single", s.direction === "short" ? "Long put" : "Long call"]].map(([k, label]) => (
                  <button type="button" key={k} role="radio" aria-checked={opt.structure === k} className={opt.structure === k ? "on" : ""} onClick={() => setOpt("structure", k)}>{label}</button>
                ))}
              </div>
              <div className="row-3 keep">
                <label className="field"><span>Capital ($)</span><input id="opt-capital" type="number" inputMode="decimal" min={1} value={s.risk.initialCapital} onChange={(e) => setRisk("initialCapital", e.target.value)} /></label>
                <label className="field"><span>Max premium per trade %</span><input id="opt-risk" type="number" inputMode="decimal" min={1} max={100} value={opt.riskPct} onChange={(e) => setOpt("riskPct", e.target.value)} /></label>
                <label className="field"><span>Days to expiry</span><input id="opt-dte" type="number" inputMode="numeric" min={1} max={365} value={opt.dte} onChange={(e) => setOpt("dte", e.target.value)} /></label>
                <label className="field"><span>Delta of option bought</span><input id="opt-delta" type="number" inputMode="decimal" min={0.05} max={0.95} step={0.05} value={opt.delta} onChange={(e) => setOpt("delta", e.target.value)} /></label>
                {opt.structure === "spread" && (
                  <label className="field"><span>Spread width ($)</span><input id="opt-width" type="number" inputMode="decimal" min={0.5} step={0.5} value={opt.spreadWidth} onChange={(e) => setOpt("spreadWidth", e.target.value)} /></label>
                )}
                <label className="field"><span>Take profit % of premium</span><input id="opt-tp" type="number" inputMode="decimal" min={0} step={5} value={opt.takeProfitPct} onChange={(e) => setOpt("takeProfitPct", e.target.value)} /></label>
                <label className="field"><span>Stop loss % of premium</span><input id="opt-sl" type="number" inputMode="decimal" min={0} max={100} step={5} value={opt.stopLossPct} onChange={(e) => setOpt("stopLossPct", e.target.value)} /></label>
                <label className="field"><span>Fee per contract ($)</span><input id="opt-fee" type="number" inputMode="decimal" min={0} step={0.05} value={opt.feePerContract} onChange={(e) => setOpt("feePerContract", e.target.value)} /></label>
                <label className="field"><span>Bid-ask spread %</span><input id="opt-spread" type="number" inputMode="decimal" min={0} step={0.5} value={opt.spreadPct} onChange={(e) => setOpt("spreadPct", e.target.value)} /></label>
              </div>
              <p className="muted tiny">
                A trade can lose at most the premium paid: {fmt.pct(Number(opt.riskPct) || 0, 0)} of the account. Delta 0.5 is about at the money.
                Fees are per contract, per leg, each way; many brokers charge $0–$0.65.
              </p>
              <details className="opt-model">
                <summary>Pricing model</summary>
                <div className="row-3 keep">
                  <label className="field"><span>Volatility lookback (days)</span><input id="opt-lookback" type="number" inputMode="numeric" min={5} max={120} value={opt.volLookbackDays} onChange={(e) => setOpt("volLookbackDays", e.target.value)} /></label>
                  <label className="field"><span>Implied ÷ realized vol</span><input id="opt-volmult" type="number" inputMode="decimal" min={0.5} max={3} step={0.05} value={opt.volMultiplier} onChange={(e) => setOpt("volMultiplier", e.target.value)} /></label>
                  <label className="field"><span>Interest rate %</span><input id="opt-rate" type="number" inputMode="decimal" min={0} max={20} step={0.25} value={opt.ratePct} onChange={(e) => setOpt("ratePct", e.target.value)} /></label>
                </div>
              </details>
            </>
          ) : (<>
          <label className="field preset-pick">
            <span>Small account preset</span>
            <select value="" onChange={(e) => e.target.value && applyPreset(e.target.value)}>
              <option value="">Choose a starting point…</option>
              {presets.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </label>
          {s.market === "stocks" && (
            <div className="seg" role="radiogroup" aria-label="Account type">
              {[["cash", "Cash account"], ["margin", "Margin account"]].map(([k, label]) => (
                <button type="button" key={k} role="radio" aria-checked={(s.account || "margin") === k} className={(s.account || "margin") === k ? "on" : ""} onClick={() => set({ account: k })}>{label}</button>
              ))}
            </div>
          )}
          <div className="row-3 keep">
            <label className="field"><span>Capital ($)</span><input type="number" inputMode="decimal" min={1} value={s.risk.initialCapital} onChange={(e) => setRisk("initialCapital", e.target.value)} /></label>
            <label className="field"><span>Position size %</span><input type="number" inputMode="decimal" min={1} max={100} value={s.risk.positionSizePct} onChange={(e) => setRisk("positionSizePct", e.target.value)} /></label>
            <label className="field"><span>Fee per side %</span><input type="number" inputMode="decimal" min={0} step={0.01} value={s.risk.feePct} onChange={(e) => setRisk("feePct", e.target.value)} /></label>
            <label className="field"><span>Slippage per fill %</span><input type="number" inputMode="decimal" min={0} max={5} step={0.01} value={s.risk.slippagePct ?? 0} onChange={(e) => setRisk("slippagePct", e.target.value)} /></label>
            <label className="field"><span>Stop loss % (0 = off)</span><input type="number" inputMode="decimal" min={0} step={0.5} value={s.risk.stopLossPct} onChange={(e) => setRisk("stopLossPct", e.target.value)} /></label>
            <label className="field"><span>Take profit % (0 = off)</span><input type="number" inputMode="decimal" min={0} step={0.5} value={s.risk.takeProfitPct} onChange={(e) => setRisk("takeProfitPct", e.target.value)} /></label>
          </div>
          {cashShort && (
            <p className="note warn tiny">Shorting stocks needs a margin account. A cash account can only buy and sell shares it owns.</p>
          )}
          {shortMarginWarning && (
            <p className="note warn tiny">
              Shorts above ~50% of equity can trigger margin calls on TradingView, which partially close the position.
              This backtester doesn't simulate margin calls, so TradingView's results may differ.
            </p>
          )}
          </>)}
          <label className="field">
            <span>Notes</span>
            <textarea rows={2} maxLength={1000} value={s.description} onChange={(e) => set({ description: e.target.value })} placeholder="What's the idea behind this strategy?" />
          </label>
        </section>

        <section className="panel output">
          <div className="tabs">
            {VIEWS.slice(1).map(([k, label]) => (
              <button key={k} className={outputTab === k ? "on" : ""} onClick={() => setView(k)}>{label === "Alerts" ? "Alerts setup" : label}</button>
            ))}
          </div>

          {outputTab === "results" && (
            run ? (
              <div className="results">
                <p className="muted small run-meta">
                  {run.strategy.symbol} · {run.strategy.interval} · {run.candles.length} bars · {fmt.date(run.candles[0].time)} → {fmt.date(run.candles[run.candles.length - 1].time)}
                  {run.result.metrics.rejectedOrders > 0 && (run.result.options
                    ? ` · ${run.result.metrics.rejectedOrders} entries skipped (one contract cost more than the limit per trade)`
                    : ` · ${run.result.metrics.rejectedOrders} entries skipped (not enough equity at the fill price)`)}
                </p>
                {run.result.options && <EstimateNote options={run.result.options} />}
                <MetricsGrid m={run.result.metrics} />
                {run.result.options ? (
                  <>
                    <OptionsCostCheck m={run.result.metrics} />
                    <OptionsPreview preview={run.result.options.preview} capital={run.strategy.risk.initialCapital} settings={run.result.options.settings} />
                  </>
                ) : (
                  <CostCheck m={run.result.metrics} settlement={run.result.settlement} strategy={run.strategy} />
                )}
                <PriceChart candles={run.candles} overlays={chart.overlays} panes={chart.panes} markers={chart.markers} />
                <h4>Equity</h4>
                <EquityChart equity={run.result.equity} />
                <h4>Trades</h4>
                {run.result.options
                  ? <OptionsTradesTable trades={run.result.trades} openTrade={run.result.openTrade} intraday={isIntraday(run.candles)} />
                  : <TradesTable trades={run.result.trades} openTrade={run.result.openTrade} intraday={isIntraday(run.candles)} />}
              </div>
            ) : (
              <div className="empty">
                <p>Set your rules, then tap <b>Run backtest</b> to see how they would have performed.</p>
                <p className="muted small">Results are hypothetical and based on past prices.</p>
              </div>
            )
          )}

          {outputTab === "pine" && (
            <div className="pine-tab">
              <p className="small" style={{ marginTop: 0 }}>
                A Pine Script v6 strategy with the same rules, sizing, fees and stop/target logic as the backtest.
                Paste it into TradingView's Pine Editor and click <b>Add to chart</b>.
              </p>
              <div className="code-actions">
                <button className="btn btn-small" onClick={copyPine}>{copied ? "Copied!" : "Copy Pine Script"}</button>
                {canShare && <button className="btn btn-ghost btn-small" onClick={sharePine}>Share…</button>}
                <a className="btn btn-ghost btn-small" href={tradingViewUrl(s)} target="_blank" rel="noreferrer">Open {s.symbol} on TradingView ↗</a>
                <button className="btn btn-ghost btn-small hide-phone" onClick={() => navigate("/app/pine", { state: { code: pine, name: s.name } })}>Run in Pine Lab</button>
              </div>
              {isNew && <p className="note tiny">Save the strategy first so its alerts can be matched to it in GrowMoneyBot.</p>}
              <pre className="code"><code>{pine}</code></pre>
            </div>
          )}

          {outputTab === "alerts" && (
            <div className="alerts-tab">
              <ol className="howto">
                <li>Copy the Pine Script, paste it into TradingView's Pine Editor and click <b>Add to chart</b>.</li>
                <li>In TradingView, open <b>Alerts → Create alert</b> and choose this strategy as the condition.</li>
                <li>Set the alert's message to exactly: <code>{"{{strategy.order.alert_message}}"}</code></li>
                <li>Under <b>Notifications</b>, turn on <b>Webhook URL</b> and paste your personal URL:
                  <div className="copy-row"><code className="break">{webhookUrl(window.location.origin, user)}</code></div>
                </li>
                <li>Each order appears on the <Link to="/app/signals">Alerts</Link> page — and as a push notification in the GrowMoneyBot mobile app.</li>
              </ol>
              <p className="muted tiny">
                Webhook alerts need a paid TradingView plan. Keep your URL private — anyone with it can post alerts to your account.
              </p>
            </div>
          )}
        </section>
      </div>

      <div className="app-spacer" />
      <div className="action-bar">
        <button className="btn btn-ghost" onClick={save} disabled={busy}>Save</button>
        <button className="btn" onClick={backtest} disabled={busy}>{busy ? "Working…" : "Run backtest"}</button>
      </div>
    </div>
  );
}
