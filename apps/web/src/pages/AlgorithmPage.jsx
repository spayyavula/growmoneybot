import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useLocation } from "react-router-dom";
import { fmt, verifyBacktest, rowsToCandles, receiptHashOf, metricsMatch } from "@gmb/core";
import * as api from "../api.js";
import { useAuth } from "../lib/auth.jsx";
import { EquityChart } from "../components/app/PriceChart.jsx";
import { MetricsGrid, TradesTable } from "../components/app/Results.jsx";
import { ExpertByline, VerifiedSeal, RulesView, Pct, intervalLabel, shortHash, useMarketBase } from "../components/market/parts.jsx";

const ts = (d) => Math.floor(new Date(d).getTime() / 1000);

export default function AlgorithmPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const { market, inApp } = useMarketBase();
  const navigate = useNavigate();
  const location = useLocation();
  const [a, setA] = useState(null);
  const [error, setError] = useState("");
  const [view, setView] = useState("live");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ state: "idle", text: "" });

  const load = () => api.api.getAlgorithm(id).then((d) => { setA(d.algorithm); setError(""); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className={inApp ? "" : "container market-public"}><p className="form-msg error">{error}</p><Link to={market}>← Marketplace</Link></div>;
  if (!a) return <div className="page-loading">Loading algorithm…</div>;

  const access = a.access || {};
  const live = a.live || {};
  const v = a.verification || {};
  const needLogin = () => navigate("/login", { state: { from: location.pathname } });

  const follow = async () => {
    if (!user) return needLogin();
    setBusy(true);
    try {
      if (access.following) await api.api.unfollowAlgorithm(a._id);
      else await api.api.followAlgorithm(a._id);
      await load();
    } catch (e) { setMsg({ state: "error", text: e.message }); }
    setBusy(false);
  };
  const toggleAlerts = async (notify) => {
    setBusy(true);
    try {
      await api.api.setAlgorithmAlerts(a._id, notify);
      setA((cur) => ({ ...cur, access: { ...cur.access, notify } }));
    } catch (e) { setMsg({ state: "error", text: e.message }); }
    setBusy(false);
  };
  const copy = async () => {
    setBusy(true);
    try {
      const d = await api.api.copyAlgorithm(a._id);
      navigate(`/app/strategies/${d.strategy._id}`);
    } catch (e) { setMsg({ state: "error", text: e.message }); setBusy(false); }
  };

  return (
    <div className={`algo-page ${inApp ? "" : "container market-public"}`}>
      <Link to={market} className="muted small">← Marketplace</Link>

      {a.status !== "published" && (
        <p className={`note ${a.status === "removed" ? "warn" : ""} small`}>
          {a.status === "removed" ? <>Removed from the marketplace{a.removedReason ? `: ${a.removedReason}` : "."}</> : "Unlisted: only people with the link who follow it can see this algorithm."}
        </p>
      )}

      <header className="algo-hero">
        <div className="algo-hero-main">
          <div className="algo-kicker">
            <span className="verified-tag"><VerifiedSeal size={15} /> Verified algorithm</span>
            <span className="muted small">v{a.version} · {a.symbol} · {intervalLabel(a.interval)} · {a.direction}</span>
          </div>
          <h1>{a.name}</h1>
          <p className="lead-sm">{a.summary}</p>
          <p className="small">by <ExpertByline author={a.author} /> · {fmt.num(a.followers, 0)} following · {fmt.num(a.copies, 0)} copies</p>
          {a.tags?.length > 0 && <div className="tag-row">{a.tags.map((t) => <span key={t} className="chip-static">#{t}</span>)}</div>}
        </div>
        <div className="algo-actions">
          {access.isAuthor ? (
            <Link to="/app/experts" className="btn">Manage in Expert program</Link>
          ) : (
            <button className={`btn ${access.following ? "btn-ghost" : ""}`} onClick={follow} disabled={busy || a.status !== "published" && !access.following}>
              {access.following ? "Following ✓" : "Follow"}
            </button>
          )}
          {access.canSeeRules && user && <button className="btn btn-ghost" onClick={copy} disabled={busy}>Copy to my strategies</button>}
          {access.following && !access.isAuthor && (
            <label className="alert-toggle small">
              <input type="checkbox" checked={!!access.notify} onChange={(e) => toggleAlerts(e.target.checked)} disabled={busy} />
              <span>Alert me when it trades</span>
            </label>
          )}
        </div>
      </header>
      {msg.text && <p className={`form-msg ${msg.state}`}>{msg.text}</p>}

      <section className="kpi-row">
        <div className="kpi">
          <span className="kpi-label">Live since {fmt.date(ts(live.since || a.publishedAt))}</span>
          <strong>{live.started && live.metrics ? <Pct v={live.metrics.totalReturnPct} /> : "—"}</strong>
          <span className="kpi-sub">{live.started && live.metrics ? `${fmt.num(live.metrics.totalTrades, 0)} trades · ${fmt.pct(live.metrics.maxDrawdownPct, 1)} max drawdown` : "Tracking starts with the next completed bar"}</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Verified backtest</span>
          <strong><Pct v={v.metrics?.totalReturnPct} /></strong>
          <span className="kpi-sub">{fmt.date(v.from)} → {fmt.date(v.to)} · {fmt.num(v.metrics?.totalTrades, 0)} trades</span>
        </div>
        <div className="kpi">
          <span className="kpi-label">Buy &amp; hold, same period</span>
          <strong><Pct v={v.metrics?.buyHoldPct} /></strong>
          <span className="kpi-sub">If you had simply held {a.symbol} over the backtest</span>
        </div>
      </section>

      <div className="editor-grid algo-grid-2">
        <section className="panel">
          <div className="seg" role="tablist">
            <button role="tab" aria-selected={view === "live"} className={view === "live" ? "on" : ""} onClick={() => setView("live")}>Live since publish</button>
            <button role="tab" aria-selected={view === "backtest"} className={view === "backtest" ? "on" : ""} onClick={() => setView("backtest")}>Verified backtest</button>
          </div>

          {view === "live" && (
            live.started && live.metrics ? (
              <>
                <p className="muted small run-meta">
                  Only trades entered after {fmt.date(ts(live.since))} count. Updated {fmt.ago(live.updatedAt)}.
                  {live.error && ` Last update failed (${live.error}); showing the previous result.`}
                </p>
                <MetricsGrid m={live.metrics} />
                <h4>Equity</h4>
                <EquityChart equity={live.equity} />
                <h4>Trades</h4>
                <TradesTable trades={live.trades || []} openTrade={live.openTrade} intraday={["15m", "1h", "4h"].includes(a.interval)} />
              </>
            ) : (
              <div className="empty">
                <p>Published {fmt.ago(a.publishedAt)}. The live record fills in as new {intervalLabel(a.interval).toLowerCase()} bars close.</p>
                <p className="muted small">Live results use only data after the publish date, so they can't be tuned after the fact.</p>
              </div>
            )
          )}

          {view === "backtest" && (
            <>
              <p className="muted small run-meta">
                {v.bars} bars of {a.symbol} from {fmt.date(v.from)} to {fmt.date(v.to)}, fetched and run by GrowMoneyBot on {fmt.date(ts(v.verifiedAt))}.
              </p>
              <MetricsGrid m={v.metrics} />
              <h4>Equity</h4>
              <EquityChart equity={v.equity} />
              <h4>Trades</h4>
              <TradesTable trades={v.trades || []} openTrade={v.openTrade} intraday={["15m", "1h", "4h"].includes(a.interval)} />
            </>
          )}
        </section>

        <aside className="algo-side">
          <section className="panel">
            <h3>Rules</h3>
            {access.canSeeRules ? (
              <RulesView rules={a.rules} />
            ) : (
              <div className="locked">
                <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
                <p className="small">Follow this algorithm to see its exact rules, copy them into your strategies and send them to TradingView.</p>
                <button className="btn btn-small" onClick={follow} disabled={busy}>{user ? "Follow to unlock" : "Log in to follow"}</button>
              </div>
            )}
          </section>

          <Receipt a={a} canRecheck={access.canSeeRules && !!user} />

          {a.description && (
            <section className="panel">
              <h3>About this algorithm</h3>
              <p className="small prewrap">{a.description}</p>
            </section>
          )}

          {a.history?.length > 0 && (
            <section className="panel">
              <h3>Earlier versions</h3>
              <ul className="history">
                {[...a.history].reverse().map((h) => (
                  <li key={h.version}>
                    <b>v{h.version}</b> · {fmt.date(ts(h.publishedAt))} → {fmt.date(ts(h.retiredAt))}
                    <span className="muted small"> · backtest <Pct v={h.verifiedMetrics?.totalReturnPct} />{h.liveMetrics ? <> · live <Pct v={h.liveMetrics.totalReturnPct} /></> : " · no live trades"}</span>
                  </li>
                ))}
              </ul>
              <p className="muted tiny">A new version restarts live tracking. Earlier records stay here for good.</p>
            </section>
          )}
        </aside>
      </div>

      <p className="muted tiny market-disclaimer">
        Results are hypothetical and don't include slippage, funding or taxes. Past performance doesn't guarantee future
        results. Published by an independent trader for educational purposes; not investment advice.
      </p>
    </div>
  );
}

// The fingerprint receipt, with an optional re-check that re-runs everything in this browser
function Receipt({ a, canRecheck }) {
  const v = a.verification || {};
  const [check, setCheck] = useState(null);

  const run = async () => {
    setCheck({ state: "loading", steps: [] });
    try {
      const ds = await api.api.getAlgorithmDataset(a._id);
      const candles = rowsToCandles(ds.rows);
      await new Promise((r) => setTimeout(r, 0));
      const mine = await verifyBacktest(a.rules, candles);
      const receiptOk = (await receiptHashOf(v)) === v.receiptHash;
      const m = metricsMatch(mine.metrics, v.metrics);
      const steps = [
        { label: "Dataset matches its fingerprint", ok: mine.dataHash === v.dataHash },
        { label: "Rules match their fingerprint", ok: mine.specHash === v.specHash },
        { label: "Your re-run gives the same results", ok: m.match, detail: m.match ? "" : `Differs in: ${m.diffs.join(", ")}` },
        { label: "Receipt hash adds up", ok: receiptOk },
      ];
      setCheck({ state: steps.every((s) => s.ok) ? "pass" : "fail", steps, bars: candles.length });
    } catch (e) {
      setCheck({ state: "error", steps: [], error: e.message });
    }
  };

  return (
    <section className="panel receipt">
      <h3>Verification receipt</h3>
      <dl className="receipt-list">
        <div><dt>Engine</dt><dd className="mono">{v.engine}</dd></div>
        <div><dt>Data</dt><dd>{v.bars} bars · {fmt.date(v.from)} → {fmt.date(v.to)}</dd></div>
        <div><dt>Data fingerprint</dt><dd className="mono" title={v.dataHash}>{shortHash(v.dataHash)}</dd></div>
        <div><dt>Rules fingerprint</dt><dd className="mono" title={v.specHash}>{shortHash(v.specHash)}</dd></div>
        <div><dt>Receipt</dt><dd className="mono" title={v.receiptHash}>{shortHash(v.receiptHash)}</dd></div>
      </dl>
      {canRecheck ? (
        <>
          <button className="btn btn-ghost btn-small btn-block" onClick={run} disabled={check?.state === "loading"}>
            {check?.state === "loading" ? "Re-running in your browser…" : "Re-check in my browser"}
          </button>
          {check?.steps?.length > 0 && (
            <ul className="check-list">
              {check.steps.map((s) => (
                <li key={s.label} className={s.ok ? "ok" : "bad"}>
                  <span aria-hidden="true">{s.ok ? "✓" : "✕"}</span> {s.label}{s.detail && <span className="muted tiny"> {s.detail}</span>}
                </li>
              ))}
            </ul>
          )}
          {check?.state === "pass" && <p className="form-msg success">Verified: you reproduced this result on {check.bars} bars.</p>}
          {check?.state === "fail" && <p className="form-msg error">This result didn't reproduce. Please report it to us.</p>}
          {check?.state === "error" && <p className="form-msg error">{check.error}</p>}
        </>
      ) : (
        <p className="muted tiny">Followers can download the frozen dataset and re-run the backtest in their own browser to confirm every number.</p>
      )}
    </section>
  );
}
