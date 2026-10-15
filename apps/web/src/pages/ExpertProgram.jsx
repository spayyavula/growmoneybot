import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { fmt, MIN_VERIFIED_TRADES } from "@gmb/core";
import * as api from "../api.js";
import { useAuth } from "../lib/auth.jsx";
import { Pct, VerifiedSeal, intervalLabel } from "../components/market/parts.jsx";

export default function ExpertProgram() {
  const { user } = useAuth();
  const status = user?.expert?.status || "none";
  return (
    <div className="expert-program">
      <div className="page-head">
        <div>
          <h1>Expert program</h1>
          <p className="muted">Publish your algorithms with results GrowMoneyBot verifies, and build a public track record.</p>
        </div>
        {user?.isAdmin && <Link to="/app/admin" className="btn btn-ghost btn-small">Review applications</Link>}
      </div>
      {status === "approved" ? <ExpertDashboard /> : <Application status={status} />}
    </div>
  );
}

// ---------- Before approval ----------

function Application({ status }) {
  const { user, setUser } = useAuth();
  const e = user?.expert || {};
  const [form, setForm] = useState({
    displayName: e.displayName || user?.name || "", bio: e.bio || "", experience: e.experience || "",
    markets: e.markets?.length ? e.markets : ["crypto"], links: { website: "", x: "", tradingview: "", ...e.links },
  });
  const [msg, setMsg] = useState({ state: "idle", text: "" });
  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value });
  const setLink = (k) => (ev) => setForm({ ...form, links: { ...form.links, [k]: ev.target.value } });
  const toggleMarket = (m) => setForm({ ...form, markets: form.markets.includes(m) ? form.markets.filter((x) => x !== m) : [...form.markets, m] });

  const submit = async (ev) => {
    ev.preventDefault();
    setMsg({ state: "loading", text: "Sending…" });
    try {
      const d = status === "pending" ? await api.api.updateExpertProfile(form) : await api.api.applyExpert(form);
      setUser(d.user);
      setMsg({ state: "success", text: status === "pending" ? "Application updated." : "Application sent. We'll review it shortly." });
    } catch (err) { setMsg({ state: "error", text: err.message }); }
  };

  if (status === "revoked") {
    return <section className="panel"><h3>Expert access revoked</h3><p className="small">{e.reviewNote}</p><p className="muted small">Contact us if you'd like to discuss this decision.</p></section>;
  }

  return (
    <div className="editor-grid program-grid">
      <section className="panel">
        {status === "pending" && <p className="note small"><b>Application under review.</b> Sent {fmt.ago(e.appliedAt)}. You can still edit it below.</p>}
        {status === "rejected" && <p className="note warn small"><b>Not approved yet.</b> {e.reviewNote} You're welcome to update your application and apply again.</p>}
        <h3>{status === "pending" ? "Your application" : "Apply to publish"}</h3>
        <form className="stack" onSubmit={submit}>
          <label className="field"><span>Public name</span><input id="xp-name" value={form.displayName} onChange={set("displayName")} maxLength={60} required /></label>
          <label className="field"><span>Your approach (shown on your profile)</span><textarea id="xp-bio" rows={4} value={form.bio} onChange={set("bio")} maxLength={1200} placeholder="What do you trade, and how? e.g. trend following on crypto majors with strict position sizing." /></label>
          <label className="field"><span>Trading experience (for our review only)</span><textarea id="xp-exp" rows={4} value={form.experience} onChange={set("experience")} maxLength={1200} placeholder="Years trading, markets, prop or fund experience, track record you can share." /></label>
          <fieldset className="field plain">
            <span>Markets you trade</span>
            <div className="chips">
              {[["crypto", "Crypto"], ["stocks", "US stocks"]].map(([k, label]) => (
                <button type="button" key={k} className={`chip ${form.markets.includes(k) ? "on" : ""}`} aria-pressed={form.markets.includes(k)} onClick={() => toggleMarket(k)}>{label}</button>
              ))}
            </div>
          </fieldset>
          <div className="row-3">
            <label className="field"><span>Website</span><input id="xp-web" value={form.links.website} onChange={setLink("website")} placeholder="example.com" /></label>
            <label className="field"><span>X profile</span><input id="xp-x" value={form.links.x} onChange={setLink("x")} placeholder="x.com/you" /></label>
            <label className="field"><span>TradingView profile</span><input id="xp-tv" value={form.links.tradingview} onChange={setLink("tradingview")} placeholder="tradingview.com/u/you" /></label>
          </div>
          <button className="btn" disabled={msg.state === "loading"}>{status === "pending" ? "Update application" : "Send application"}</button>
          {msg.text && <p className={`form-msg ${msg.state}`}>{msg.text}</p>}
        </form>
      </section>
      <aside className="panel">
        <h3>How it works</h3>
        <ol className="howto">
          <li><b>Apply.</b> We review every expert by hand.</li>
          <li><b>Publish from your strategies.</b> Our server fetches the price history itself and re-runs your backtest. You can't upload results.</li>
          <li><b>Build a live record.</b> From the publish date on, every new trade your rules make is tracked in public.</li>
          <li><b>Followers unlock your rules</b> and can copy them or re-check your verification in their own browser.</li>
        </ol>
        <p className="muted tiny">Paid subscriptions and revenue sharing for experts are planned for a later release.</p>
      </aside>
    </div>
  );
}

// ---------- Approved experts ----------

function ExpertDashboard() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [mine, setMine] = useState(null);
  const [strategies, setStrategies] = useState([]);
  const [error, setError] = useState("");

  const load = () => {
    api.api.listMyAlgorithms().then((d) => setMine(d.algorithms)).catch((e) => setError(e.message));
    api.listStrategies().then((d) => setStrategies(d.strategies)).catch(() => {});
  };
  useEffect(load, []);

  return (
    <div className="editor-grid program-grid">
      <section className="panel">
        <div className="panel-head">
          <h3>Your algorithms</h3>
          <Link to={`/app/experts/${user.id}`} className="link-btn">View public profile</Link>
        </div>
        {error && <p className="form-msg error">{error}</p>}
        {mine === null && !error && <p className="muted">Loading…</p>}
        {mine?.length === 0 && <p className="muted small">Nothing published yet. Pick one of your strategies to publish it.</p>}
        <div className="mine-list">{mine?.map((a) => <MyAlgorithm key={a._id} a={a} onChange={load} />)}</div>
      </section>
      <PublishForm strategies={strategies} preselect={params.get("publish") || ""} onDone={() => { setParams({}); load(); }} />
    </div>
  );
}

function MyAlgorithm({ a, onChange }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ state: "idle", text: "" });
  const act = async (fn, ok) => {
    setBusy(true); setMsg({ state: "loading", text: "Working…" });
    try { await fn(); setMsg({ state: "success", text: ok }); onChange(); } catch (e) { setMsg({ state: "error", text: e.message }); }
    setBusy(false);
  };
  const lm = a.live?.metrics;
  return (
    <article className="mine-row">
      <div className="mine-main">
        <Link to={`/app/marketplace/${a._id}`}><b>{a.name}</b></Link> <span className={`status-pill ${a.status}`}>{a.status}</span>
        <p className="muted small" style={{ margin: "2px 0 0" }}>
          v{a.version} · {a.symbol} · {intervalLabel(a.interval)} · {fmt.num(a.followers, 0)} following ·
          backtest <Pct v={a.verified?.metrics?.totalReturnPct} /> · live {a.live?.started && lm ? <Pct v={lm.totalReturnPct} /> : "not started"}
        </p>
        {a.status === "removed" && <p className="form-msg error small">Removed: {a.removedReason}</p>}
      </div>
      {a.status !== "removed" && (
        <div className="mine-actions">
          <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => act(() => api.api.republishAlgorithm(a._id), "New version published and verified.")} title="Re-verify your strategy's current rules as a new version">New version</button>
          {a.status === "published"
            ? <button className="btn btn-plain btn-small" disabled={busy} onClick={() => act(() => api.api.updateAlgorithm(a._id, { status: "unlisted" }), "Unlisted.")}>Unlist</button>
            : <button className="btn btn-plain btn-small" disabled={busy} onClick={() => act(() => api.api.updateAlgorithm(a._id, { status: "published" }), "Listed again.")}>List again</button>}
        </div>
      )}
      {msg.text && <p className={`form-msg ${msg.state} small mine-msg`}>{msg.text}</p>}
    </article>
  );
}

function PublishForm({ strategies, preselect, onDone }) {
  const [form, setForm] = useState({ strategyId: preselect, summary: "", description: "", tags: "" });
  const [msg, setMsg] = useState({ state: "idle", text: "" });
  useEffect(() => { if (preselect) setForm((f) => ({ ...f, strategyId: preselect })); }, [preselect]);
  const set = (k) => (ev) => setForm({ ...form, [k]: ev.target.value });
  const eligible = strategies.filter((s) => s.market !== "csv");

  const submit = async (ev) => {
    ev.preventDefault();
    setMsg({ state: "loading", text: "Fetching price data and verifying your backtest…" });
    try {
      const d = await api.api.publishAlgorithm({ ...form, tags: form.tags.split(",").map((t) => t.trim()).filter(Boolean) });
      setMsg({ state: "success", text: `Published and verified: ${d.algorithm.verification.metrics.totalTrades} trades, receipt ${d.algorithm.verification.receiptHash.slice(0, 10)}…` });
      setForm({ strategyId: "", summary: "", description: "", tags: "" });
      onDone();
    } catch (e) { setMsg({ state: "error", text: e.message }); }
  };

  return (
    <section className="panel">
      <h3>Publish a strategy</h3>
      <form className="stack" onSubmit={submit}>
        <label className="field">
          <span>Strategy</span>
          <select id="pub-strategy" value={form.strategyId} onChange={set("strategyId")} required>
            <option value="" disabled>Choose one of your strategies…</option>
            {eligible.map((s) => <option key={s._id} value={s._id}>{s.name} · {s.symbol} · {intervalLabel(s.interval)}</option>)}
          </select>
        </label>
        <label className="field"><span>One-line summary</span><input id="pub-summary" value={form.summary} onChange={set("summary")} maxLength={160} required placeholder="e.g. Daily trend following on BTC with a 2-EMA filter" /></label>
        <label className="field"><span>Description (optional)</span><textarea id="pub-desc" rows={4} value={form.description} onChange={set("description")} maxLength={3000} placeholder="The idea, when it works, when it doesn't, how you'd size it." /></label>
        <label className="field"><span>Tags (comma-separated, up to 5)</span><input id="pub-tags" value={form.tags} onChange={set("tags")} placeholder="trend, btc, swing" /></label>
        <button className="btn" disabled={msg.state === "loading" || !eligible.length}>{msg.state === "loading" ? "Verifying…" : "Verify & publish"}</button>
        {msg.text && <p className={`form-msg ${msg.state}`}>{msg.text}</p>}
      </form>
      <ul className="fine-print">
        <li><VerifiedSeal size={13} /> We re-run the backtest on price data our server fetches. Uploaded CSV data can't be published.</li>
        <li>It needs at least {MIN_VERIFIED_TRADES} closed trades in the verified backtest.</li>
        <li>Later changes to your strategy don't affect the published version until you publish a new version, which restarts live tracking.</li>
      </ul>
    </section>
  );
}
