import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../api.js";
import { useAuth } from "../lib/auth.jsx";
import { AlgoCard, useMarketBase, VerifiedSeal } from "../components/market/parts.jsx";

const SORTS = [["followers", "Popular"], ["live", "Best live"], ["verified", "Best backtest"], ["new", "Newest"]];
const MARKETS = [["", "All markets"], ["crypto", "Crypto"], ["stocks", "Stocks"]];

export default function Marketplace() {
  const { user } = useAuth();
  const { inApp } = useMarketBase();
  const [sort, setSort] = useState("followers");
  const [market, setMarket] = useState("");
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all");
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setQuery(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    setItems(null);
    const params = { sort, ...(market && { market }), ...(query && { q: query }) };
    const load = tab === "following" ? api.api.listFollowing() : api.api.listMarketplace(params);
    load.then((d) => { setItems(d.algorithms); setError(""); }).catch((e) => setError(e.message));
  }, [sort, market, query, tab]);

  const expertStatus = user?.expert?.status;

  return (
    <div className={inApp ? "" : "container market-public"}>
      <div className="page-head market-head">
        <div>
          <h1>Marketplace</h1>
          <p className="muted">Algorithms from approved expert traders. Every result is re-run by GrowMoneyBot on data it fetches itself.</p>
        </div>
        {user ? (
          expertStatus === "approved"
            ? <Link to="/app/experts" className="btn btn-small">Publish an algorithm</Link>
            : <Link to="/app/experts" className="btn btn-ghost btn-small">{expertStatus === "pending" ? "Application pending" : "Become an expert"}</Link>
        ) : (
          <Link to="/signup" className="btn btn-ghost btn-small">Become an expert</Link>
        )}
      </div>

      <div className="how-verified">
        <VerifiedSeal size={20} />
        <p className="small">
          <b>How verification works.</b> When an expert publishes, our server downloads the price history, runs the
          backtest, and freezes the rules, the data and the results with SHA-256 fingerprints. Live results only count
          trades made after the publish date, so you can see how an algorithm does on data it has never seen.
        </p>
      </div>

      {user && (
        <div className="seg market-tabs">
          <button className={tab === "all" ? "on" : ""} onClick={() => setTab("all")}>All algorithms</button>
          <button className={tab === "following" ? "on" : ""} onClick={() => setTab("following")}>Following</button>
        </div>
      )}

      {tab === "all" && (
        <div className="market-filters">
          <input type="search" placeholder="Search by name, symbol or tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search algorithms" />
          <div className="chips" role="group" aria-label="Market">
            {MARKETS.map(([k, label]) => <button key={k} className={`chip ${market === k ? "on" : ""}`} onClick={() => setMarket(k)}>{label}</button>)}
          </div>
          <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort by">
            {SORTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      )}

      {error && <p className="form-msg error">{error}</p>}
      {items === null && !error && <p className="muted">Loading…</p>}
      {items?.length === 0 && (
        <div className="empty panel">
          {tab === "following"
            ? <><h2>Nothing followed yet</h2><p className="muted">Follow an algorithm to see its rules, copy it, and re-check its verification.</p></>
            : <><h2>No algorithms here yet</h2><p className="muted">{query || market ? "Try a different search or market." : "Approved experts will publish their first algorithms soon."}</p></>}
        </div>
      )}
      {items?.length > 0 && <div className="algo-grid">{items.map((a) => <AlgoCard key={a._id} a={a} />)}</div>}

      <p className="muted tiny market-disclaimer">
        Past performance, backtested or live, does not guarantee future results. Algorithms are published by independent
        traders for educational purposes and are not investment advice.
      </p>
    </div>
  );
}
