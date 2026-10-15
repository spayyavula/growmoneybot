import { useState } from "react";
import { Link } from "react-router-dom";
import { webhookUrl } from "@gmb/core";
import * as api from "../api.js";
import { useAuth } from "../lib/auth.jsx";

export default function Account() {
  const { user, setUser, logout } = useAuth();
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const url = webhookUrl(window.location.origin, user);
  const [pw, setPw] = useState("");
  const [delMsg, setDelMsg] = useState("");
  const removeAccount = async (e) => {
    e.preventDefault();
    if (!window.confirm("Permanently delete your account and all its data?")) return;
    try { await api.api.deleteAccount(pw); logout(); } catch (err) { setDelMsg(err.message); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ }
  };
  const rotate = async () => {
    if (!window.confirm("Create a new webhook URL? Existing TradingView alerts will stop delivering until you update them.")) return;
    try { const d = await api.rotateWebhookToken(); setUser(d.user); setMsg("New webhook URL created."); } catch (e) { setMsg(e.message); }
  };

  return (
    <div>
      <div className="page-head"><div><h1>Account</h1><p className="muted">{user?.email}</p></div></div>

      <section className="panel">
        <h3>TradingView webhook URL</h3>
        <div className="copy-row">
          <code className="break">{url}</code>
          <button className="btn btn-small" onClick={copy}>{copied ? "Copied!" : "Copy"}</button>
          <button className="btn btn-ghost btn-small" onClick={rotate}>New URL</button>
        </div>
        {msg && <p className="form-msg success">{msg}</p>}
        <p className="muted tiny">Keep this private — anyone with it can post alerts to your account.</p>
      </section>

      <section className="panel">
        <h3>Expert program</h3>
        <p className="small">
          {user?.expert?.status === "approved"
            ? "You're an approved expert. Publish strategies to the marketplace and manage your listings."
            : user?.expert?.status === "pending"
              ? "Your application is under review."
              : "Experienced trader? Apply to publish your algorithms with verified results."}
        </p>
        <div className="copy-row">
          <Link to="/app/experts" className="btn btn-ghost btn-small">{user?.expert?.status === "approved" ? "Open Expert program" : "Expert program"}</Link>
          {user?.isAdmin && <Link to="/app/admin" className="btn btn-plain btn-small">Admin review</Link>}
        </div>
      </section>

      <section className="panel">
        <h3>Mobile app</h3>
        <p className="small">
          Get push notifications for your TradingView alerts with the GrowMoneyBot app for iPhone and Android.
          Sign in with the same email and turn on notifications in the app's Account tab.
        </p>
      </section>

      <section className="panel">
        <button className="btn btn-ghost btn-block" onClick={logout}>Log out</button>
      </section>

      <section className="panel">
        <h3>Delete account</h3>
        <p className="small muted">Permanently deletes your account, strategies, saved scripts and alerts. This can't be undone.</p>
        <form className="field-row" onSubmit={removeAccount}>
          <input type="password" placeholder="Your password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <button className="btn btn-destructive" disabled={!pw}>Delete my account</button>
        </form>
        {delMsg && <p className="form-msg error">{delMsg}</p>}
      </section>
    </div>
  );
}
