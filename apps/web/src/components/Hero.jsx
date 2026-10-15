import { useState } from "react";
import { Link } from "react-router-dom";
import { joinWaitlist } from "../api.js";

export default function Hero() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState({ state: "idle", msg: "" });

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ state: "loading", msg: "" });
    try {
      const res = await joinWaitlist({ email, interest: "investing-education" });
      setStatus({ state: "success", msg: res.message });
      setEmail("");
    } catch (err) {
      setStatus({ state: "error", msg: err.message });
    }
  };

  return (
    <section className="hero" id="top">
      <div className="container hero-grid">
        <div className="hero-copy">
          <span className="eyebrow">Strategy builder + backtester</span>
          <h1>Test the idea<br /><em>before you trade it.</em></h1>
          <p className="lead">
            Build trading strategies from technical indicators — RSI, MACD, moving averages,
            Bollinger Bands and more — backtest them on crypto and US stock history, then send
            them to TradingView as Pine Script with one click.
          </p>
          <div className="hero-ctas">
            <Link to="/signup" className="btn">Start building — it's free</Link>
            <a href="#how" className="btn btn-ghost">See how it works</a>
          </div>

          <form className="waitlist inline" id="waitlist" onSubmit={onSubmit}>
            <p className="muted small">Not ready yet? Get product updates by email.</p>
            <div className="field-row">
              <input type="email" placeholder="you@email.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn btn-ghost" disabled={status.state === "loading"}>
                {status.state === "loading" ? "Joining…" : "Keep me posted"}
              </button>
            </div>
            {status.msg && <p className={`form-msg ${status.state}`}>{status.msg}</p>}
          </form>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="card-stack">
            <div className="mini-card rule-card">
              <span className="muted small">Entry rule</span>
              <p className="rule-line"><b>EMA(20)</b> crosses above <b>EMA(50)</b></p>
              <p className="rule-line"><b>RSI(14)</b> &lt; <b>70</b></p>
            </div>
            <div className="mini-card">
              <span className="muted small">Backtest · BTCUSDT · 1D</span>
              <svg viewBox="0 0 300 90" className="spark">
                <polyline fill="none" stroke="var(--accent-2)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points="0,80 30,72 60,75 90,60 120,64 150,48 180,52 210,35 240,40 270,22 300,14" />
              </svg>
              <div className="split-row">
                <span><span className="muted small">Trades</span><b>24</b></span>
                <span><span className="muted small">Win rate</span><b>54%</b></span>
                <span><span className="muted small">Max DD</span><b>12%</b></span>
              </div>
              <span className="muted tiny">Illustrative example</span>
            </div>
            <div className="mini-card chat code-card">
              <p className="bubble bot mono">//@version=6<br />strategy("EMA crossover")<br />…</p>
              <p className="bubble you">Copied to TradingView ✓</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
