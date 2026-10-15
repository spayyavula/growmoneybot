import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { fmt } from "@gmb/core";
import * as api from "../api.js";
import { useAuth } from "../lib/auth.jsx";
import { Pct } from "../components/market/parts.jsx";

const EXPERT_TABS = [["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"], ["revoked", "Revoked"]];
const ALGO_TABS = [["published", "Published"], ["unlisted", "Unlisted"], ["removed", "Removed"]];

export default function Admin() {
  const { user } = useAuth();
  const [section, setSection] = useState("experts");
  if (!user?.isAdmin) return <Navigate to="/app" replace />;
  return (
    <div>
      <div className="page-head"><div><h1>Admin</h1><p className="muted">Review expert applications and marketplace listings.</p></div></div>
      <div className="seg" style={{ maxWidth: 360 }}>
        <button className={section === "experts" ? "on" : ""} onClick={() => setSection("experts")}>Experts</button>
        <button className={section === "algorithms" ? "on" : ""} onClick={() => setSection("algorithms")}>Algorithms</button>
      </div>
      {section === "experts" ? <Experts /> : <Algorithms />}
    </div>
  );
}

function Experts() {
  const [tab, setTab] = useState("pending");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const load = () => { setItems(null); api.api.adminListExperts(tab).then((d) => setItems(d.experts)).catch((e) => setError(e.message)); };
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="panel">
      <div className="chips">{EXPERT_TABS.map(([k, l]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {error && <p className="form-msg error">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="review-list">{items?.map((u) => <ExpertReview key={u.id} u={u} tab={tab} onDone={load} />)}</div>
    </section>
  );
}

function ExpertReview({ u, tab, onDone }) {
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState("");
  const e = u.expert;
  const act = async (action) => {
    try { await api.api.adminReviewExpert(u.id, action, note); onDone(); } catch (err) { setMsg(err.message); }
  };
  return (
    <article className="review-card">
      <div className="review-head">
        <div><b>{e.displayName}</b> <span className="muted small">{u.email}</span></div>
        <span className="muted tiny">Applied {fmt.ago(e.appliedAt)}</span>
      </div>
      <p className="small"><span className="muted">Markets:</span> {e.markets.join(", ") || "—"}</p>
      <p className="small prewrap"><span className="muted">Approach:</span> {e.bio}</p>
      <p className="small prewrap"><span className="muted">Experience:</span> {e.experience}</p>
      <p className="small link-row">{Object.entries(e.links).filter(([, v]) => v).map(([k, v]) => <a key={k} href={v} target="_blank" rel="noreferrer nofollow">{{ website: "Website", x: "X", tradingview: "TradingView" }[k] || k} ↗</a>)}</p>
      {e.reviewNote && <p className="note small">Note: {e.reviewNote}</p>}
      <div className="review-actions">
        <input id={`note-${u.id}`} value={note} onChange={(ev) => setNote(ev.target.value)} placeholder={tab === "approved" ? "Reason for revoking (shown to the expert)" : "Note to the applicant (required to reject)"} maxLength={500} />
        {tab !== "approved" && <button className="btn btn-small" onClick={() => act("approve")}>Approve</button>}
        {tab === "pending" && <button className="btn btn-destructive btn-small" onClick={() => act("reject")}>Reject</button>}
        {tab === "approved" && <button className="btn btn-destructive btn-small" onClick={() => act("revoke")}>Revoke</button>}
      </div>
      {msg && <p className="form-msg error">{msg}</p>}
    </article>
  );
}

function Algorithms() {
  const [tab, setTab] = useState("published");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const load = () => { setItems(null); api.api.adminListAlgorithms(tab).then((d) => setItems(d.algorithms)).catch((e) => setError(e.message)); };
  useEffect(load, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="panel">
      <div className="chips">{ALGO_TABS.map(([k, l]) => <button key={k} className={`chip ${tab === k ? "on" : ""}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {error && <p className="form-msg error">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && <p className="muted">Nothing here.</p>}
      <div className="review-list">{items?.map((a) => <AlgoReview key={a._id} a={a} onDone={load} />)}</div>
    </section>
  );
}

function AlgoReview({ a, onDone }) {
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");
  const act = async (fn) => { try { await fn(); onDone(); } catch (err) { setMsg(err.message); } };
  return (
    <article className="review-card">
      <div className="review-head">
        <div><Link to={`/app/marketplace/${a._id}`}><b>{a.name}</b></Link> <span className="muted small">by {a.author?.displayName} ({a.authorEmail})</span></div>
        <span className="muted tiny">v{a.version} · {fmt.num(a.followers, 0)} following</span>
      </div>
      <p className="small">{a.summary}</p>
      <p className="small muted">Backtest <Pct v={a.verified?.metrics?.totalReturnPct} /> · live {a.live?.started && a.live.metrics ? <Pct v={a.live.metrics.totalReturnPct} /> : "not started"}</p>
      {a.removedReason && <p className="note warn small">Removed: {a.removedReason}</p>}
      <div className="review-actions">
        {a.status !== "removed" ? (
          <>
            <input id={`reason-${a._id}`} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (shown to the expert)" maxLength={500} />
            <button className="btn btn-destructive btn-small" onClick={() => act(() => api.api.adminRemoveAlgorithm(a._id, reason))}>Remove</button>
          </>
        ) : (
          <button className="btn btn-ghost btn-small" onClick={() => act(() => api.api.adminRestoreAlgorithm(a._id))}>Restore as unlisted</button>
        )}
      </div>
      {msg && <p className="form-msg error">{msg}</p>}
    </article>
  );
}
