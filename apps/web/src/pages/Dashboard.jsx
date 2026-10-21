import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { INTERVALS, fmt } from "@gmb/core";
import * as api from "../api.js";

export default function Dashboard() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.listStrategies().then((d) => setItems(d.strategies)).catch((e) => setError(e.message));
  }, []);

  const remove = async (s) => {
    if (!window.confirm(`Delete "${s.name}"? This can't be undone.`)) return;
    try {
      await api.deleteStrategy(s._id);
      setItems((xs) => xs.filter((x) => x._id !== s._id));
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Strategies</h1>
          <p className="muted small">Build, backtest, and send to TradingView. New here? <Link to="/app/strategies/guided">Try the guided setup</Link>.</p>
        </div>
        <div className="head-actions hide-phone">
          <Link to="/app/strategies/guided" className="btn btn-ghost btn-small">Guided setup</Link>
          <Link to="/app/strategies/new" className="btn btn-small">+ New strategy</Link>
        </div>
      </div>
      {error && <p className="form-msg error">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && (
        <div className="empty panel">
          <h3>No strategies yet</h3>
          <p className="muted">New to trading strategies? Answer five questions and get a complete strategy, tested on past prices.</p>
          <div className="empty-actions">
            <Link to="/app/strategies/guided" className="btn">Build one step by step</Link>
            <Link to="/app/strategies/new" className="btn btn-ghost">Start from a template</Link>
          </div>
        </div>
      )}
      {items?.length > 0 && (
        <div className="cards">
          {items.map((s) => {
            const m = s.lastBacktest?.metrics;
            return (
              <article key={s._id} className="panel strat-card">
                <Link to={`/app/strategies/${s._id}`} className="strat-link">
                  <h3>{s.name}</h3>
                  <p className="muted small" style={{ margin: 0 }}>
                    {s.symbol} · {INTERVALS.find((i) => i.key === s.interval)?.label ?? s.interval} · {s.direction}
                  </p>
                  {m ? (
                    <div className="mini-metrics">
                      <div><span>Net</span><b className={fmt.signClass(m.netProfitPct)}>{fmt.pct(m.netProfitPct, 1)}</b></div>
                      <div><span>Max DD</span><b>{fmt.pct(m.maxDrawdownPct, 1)}</b></div>
                      <div><span>Trades</span><b>{fmt.num(m.totalTrades, 0)}</b></div>
                      <div><span>Win rate</span><b>{fmt.pct(m.winRatePct, 0)}</b></div>
                    </div>
                  ) : <p className="muted small">Not backtested yet</p>}
                </Link>
                <div className="strat-foot">
                  <span className="muted tiny">Updated {fmt.ago(s.updatedAt)}</span>
                  <button className="link-btn danger" onClick={() => remove(s)}>Delete</button>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {items?.length > 0 && <Link to="/app/strategies/new" className="btn fab">+ New</Link>}
    </div>
  );
}
