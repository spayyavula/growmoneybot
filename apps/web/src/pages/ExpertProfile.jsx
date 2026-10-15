import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fmt } from "@gmb/core";
import * as api from "../api.js";
import { AlgoCard, VerifiedSeal, useMarketBase } from "../components/market/parts.jsx";

const LINKS = [["website", "Website"], ["x", "X"], ["tradingview", "TradingView"]];

export default function ExpertProfile() {
  const { id } = useParams();
  const { market, inApp } = useMarketBase();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.api.getExpert(id).then(setData).catch((e) => setError(e.message));
  }, [id]);

  const wrap = inApp ? "" : "container market-public";
  if (error) return <div className={wrap}><p className="form-msg error">{error}</p><Link to={market}>← Marketplace</Link></div>;
  if (!data) return <div className="page-loading">Loading…</div>;
  const { expert, algorithms } = data;
  const initials = expert.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className={wrap}>
      <Link to={market} className="muted small">← Marketplace</Link>
      <header className="expert-hero">
        <div className="avatar" aria-hidden="true">{initials}</div>
        <div>
          <h1>{expert.displayName} <VerifiedSeal size={22} title="Approved expert" /></h1>
          <p className="muted small">
            Approved expert · {expert.markets.map((m) => (m === "crypto" ? "Crypto" : "Stocks")).join(" & ")} · member since {fmt.date(Math.floor(new Date(expert.memberSince).getTime() / 1000))}
          </p>
          <div className="link-row">
            {LINKS.filter(([k]) => expert.links?.[k]).map(([k, label]) => (
              <a key={k} href={expert.links[k]} target="_blank" rel="noreferrer nofollow" className="small">{label} ↗</a>
            ))}
          </div>
        </div>
      </header>
      {expert.bio && <section className="panel"><p className="prewrap" style={{ margin: 0 }}>{expert.bio}</p></section>}
      <h2 className="sub-title">Published algorithms</h2>
      {algorithms.length ? <div className="algo-grid">{algorithms.map((a) => <AlgoCard key={a._id} a={a} />)}</div> : <p className="muted">No published algorithms yet.</p>}
    </div>
  );
}
