import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { webhookUrl, fmt } from "@gmb/core";
import * as api from "../api.js";
import { useAuth } from "../lib/auth.jsx";

export default function Signals() {
  const { user } = useAuth();
  const [signals, setSignals] = useState(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const url = webhookUrl(window.location.origin, user);

  const load = useCallback(() => {
    api.listSignals().then((d) => { setSignals(d.signals); setError(""); }).catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };
  const clear = async () => {
    if (!window.confirm("Delete all received alerts?")) return;
    try { await api.clearSignals(); setSignals([]); } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Alerts</h1>
          <p className="muted small">Trades by marketplace algorithms you follow, and alerts your TradingView strategies send here. Updates every 30 seconds.</p>
        </div>
        <button className="btn btn-ghost btn-small" onClick={load}>Refresh</button>
      </div>

      <section className="panel">
        <h3>Your TradingView webhook URL</h3>
        <div className="copy-row">
          <code className="break">{url}</code>
          <button className="btn btn-small" onClick={copy}>{copied ? "Copied!" : "Copy URL"}</button>
        </div>
        <p className="muted tiny">
          In TradingView: <b>Create alert → Notifications → Webhook URL</b>. For strategies made here, set the alert
          message to <code>{"{{strategy.order.alert_message}}"}</code>. Webhooks need a paid TradingView plan with
          two-factor authentication. Need a new URL? Go to <Link to="/app/account">Account</Link>.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h3>Received alerts</h3>
          {signals?.length > 0 && <button className="link-btn danger" onClick={clear}>Clear all</button>}
        </div>
        {error && <p className="form-msg error">{error}</p>}
        {signals === null && !error && <p className="muted">Loading…</p>}
        {signals?.length === 0 && (
          <p className="muted">
            No alerts yet. Follow an algorithm in the <Link to="/app/marketplace">marketplace</Link> to get an alert
            whenever it enters or exits a trade, or connect a TradingView alert with the URL above.
          </p>
        )}
        {signals?.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Received</th><th>Action</th><th>Ticker</th><th>Price</th><th>Interval</th><th>Message</th></tr></thead>
              <tbody>
                {signals.map((s) => (
                  <tr key={s._id}>
                    <td data-label="Received">{new Date(s.createdAt).toLocaleString()}</td>
                    <td data-label="Action">{s.action ? <span className={`pill ${s.action === "buy" ? "buy" : "sell"}`}>{s.action}{s.type ? ` · ${s.type}` : ""}</span> : "—"}</td>
                    <td data-label="Ticker">{s.exchange ? `${s.exchange}:` : ""}{s.ticker || "—"}</td>
                    <td data-label="Price">{s.price != null ? fmt.price(s.price) : "—"}</td>
                    <td data-label="Interval">{s.interval || "—"}</td>
                    <td data-label="Message" className="raw full">
                      {s.source === "marketplace" ? (
                        <span className="small">
                          <Link to={`/app/marketplace/${s.algorithm}`}><b>{s.algorithmName || "Followed algorithm"}</b></Link>
                          {s.algorithmVersion ? <span className="muted"> v{s.algorithmVersion}</span> : null} · {s.message}
                        </span>
                      ) : <code>{s.raw}</code>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
