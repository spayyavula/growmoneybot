import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fmt, RISK_LABELS, TARGET_VOL_PCT } from "@gmb/core";
import * as api from "../api.js";
import Logo from "../components/Logo.jsx";
import { VerifiedSeal, Pct, intervalLabel, shortHash, useMarketBase } from "../components/market/parts.jsx";
import { CompareChart, MonthlyGrid, RiskMeter, compareSeries } from "../components/market/charts.jsx";
import { drawShareCard } from "../components/market/shareCard.js";

const ts = (d) => Math.floor(new Date(d).getTime() / 1000);

// One-page summary of a published algorithm, built to be printed, saved as PDF or shared.
export default function FactSheet() {
  const { id } = useParams();
  const { market, inApp } = useMarketBase();
  const [a, setA] = useState(null);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    api.api.getAlgorithm(id).then((d) => setA(d.algorithm)).catch((e) => setError(e.message));
  }, [id]);

  const wrap = inApp ? "" : "container market-public";
  if (error) return <div className={wrap}><p className="form-msg error">{error}</p><Link to={market}>← Marketplace</Link></div>;
  if (!a) return <div className="page-loading">Loading fact sheet…</div>;

  const v = a.verification || {}, m = v.metrics || {}, risk = v.risk || {};
  const live = a.live || {}, lm = live.metrics;
  const publicUrl = `${window.location.origin}/marketplace/${a._id}`;
  const liveRanked = live.started && live.risk && !live.risk.lowSample && (lm?.totalTrades ?? 0) >= 3;

  const downloadImage = async () => {
    try {
      const blob = await drawShareCard(a, publicUrl);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${a.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-growmoneybot.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setMsg(e.message); }
  };
  const share = async () => {
    try {
      const blob = await drawShareCard(a, publicUrl);
      const file = new File([blob], "growmoneybot.png", { type: "image/png" });
      const data = { title: a.name, text: `${a.name}: verified results on GrowMoneyBot`, url: publicUrl };
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ ...data, files: [file] });
      else if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(publicUrl); setMsg("Link copied."); }
    } catch { /* share cancelled */ }
  };
  const copyLink = async () => {
    try { await navigator.clipboard.writeText(publicUrl); setMsg("Link copied."); } catch { setMsg(publicUrl); }
  };

  const facts = [
    ["Market", `${a.market === "stocks" ? "US stocks" : "Crypto"} · ${a.symbol}`],
    ["Timeframe", intervalLabel(a.interval)],
    ["Direction", a.direction === "short" ? "Short only" : "Long only"],
    ["Version", `v${a.version}, published ${fmt.date(ts(a.publishedAt))}`],
    ["Backtest data", `${v.bars} bars, ${fmt.date(v.from)} → ${fmt.date(v.to)}`],
    ["Trades", `${fmt.num(m.totalTrades, 0)} · ${fmt.pct(m.winRatePct, 0)} winners`],
    ["Profit factor", fmt.num(m.profitFactor)],
    ["Sharpe ratio", fmt.num(m.sharpe)],
    ["Time in market", fmt.pct(m.exposurePct, 0)],
    ["Position size · fee", a.rules ? `${a.rules.risk.positionSizePct}% · ${a.rules.risk.feePct}% per side` : "Visible to followers"],
  ];

  return (
    <div className={`factsheet-page ${wrap}`}>
      <div className="factsheet-tools no-print">
        <Link to={`${market}/${a._id}`} className="muted small">← {a.name}</Link>
        <div className="tool-buttons">
          <button className="btn btn-small" onClick={share}>Share</button>
          <button className="btn btn-ghost btn-small" onClick={downloadImage}>Download image</button>
          <button className="btn btn-ghost btn-small" onClick={copyLink}>Copy link</button>
          <button className="btn btn-plain btn-small" onClick={() => window.print()}>Print or save PDF</button>
        </div>
        {msg && <p className="form-msg success small">{msg}</p>}
      </div>

      <article className="factsheet">
        <header className="fs-head">
          <div className="fs-brand"><Logo size={26} /><span>GrowMoneyBot</span><span className="muted">· Algorithm fact sheet</span></div>
          <span className="verified-tag"><VerifiedSeal size={15} /> Verified by GrowMoneyBot</span>
        </header>

        <div className="fs-title">
          <h1>{a.name}</h1>
          <p className="fs-sub">{a.summary}</p>
          <p className="small muted">By {a.author?.displayName} · as of {fmt.date(ts(live.updatedAt || v.verifiedAt))}</p>
        </div>

        <section className="fs-kpis">
          <div><span>Live since {fmt.date(ts(live.since || a.publishedAt))}</span><strong>{live.started && lm ? <Pct v={lm.totalReturnPct} /> : "—"}</strong></div>
          <div><span>Verified backtest</span><strong><Pct v={m.totalReturnPct} /></strong></div>
          <div><span>Per year (CAGR)</span><strong><Pct v={m.cagrPct} /></strong></div>
          <div><span>Max drawdown</span><strong>{fmt.pct(m.maxDrawdownPct, 1)}</strong></div>
          <div><span>At {TARGET_VOL_PCT}% volatility</span><strong><Pct v={liveRanked ? live.risk.riskAdjReturnPct : risk.riskAdjReturnPct} /></strong></div>
          <div><span>Risk</span><strong className="fs-risk"><RiskMeter rating={risk.rating} compact /> {risk.rating ? `${risk.rating}/5` : ""}</strong></div>
        </section>

        <div className="fs-body">
          <section className="fs-chart">
            <h2>Growth of 100, verified backtest</h2>
            <CompareChart series={compareSeries(a.name, v.equity, v.benchmarks)} height={230} />
            {live.started && live.equity?.length > 1 && (
              <>
                <h2>Growth of 100 since publish (live)</h2>
                <CompareChart series={compareSeries(a.name, live.equity, live.benchmarks)} height={170} />
              </>
            )}
          </section>
          <aside className="fs-facts">
            <h2>Key facts</h2>
            <dl>{facts.map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}</dl>
            <h2>Risk</h2>
            <p className="small">
              {RISK_LABELS[risk.rating] || "—"} risk ({risk.rating}/5): {fmt.pct(risk.volatilityPct, 1)} annual volatility and a{" "}
              {fmt.pct(m.maxDrawdownPct, 1)} worst drawdown. Scaled to {TARGET_VOL_PCT}% volatility it returned{" "}
              <Pct v={risk.riskAdjReturnPct} /> a year.
            </p>
          </aside>
        </div>

        <section>
          <h2>Monthly returns (%), verified backtest</h2>
          <MonthlyGrid monthly={v.monthly} />
        </section>

        <footer className="fs-foot">
          <p className="mono tiny">Receipt {shortHash(v.receiptHash)} · data {shortHash(v.dataHash)} · rules {shortHash(v.specHash)} · {v.engine}</p>
          <p className="tiny muted">
            Backtested results are hypothetical, computed by GrowMoneyBot on historical prices it fetched itself, and don't include
            slippage, funding or taxes. Live results count only trades entered after the publish date. Past performance doesn't
            guarantee future results. Published by an independent trader for educational purposes; not investment advice.
            Full results: {publicUrl}
          </p>
        </footer>
      </article>
    </div>
  );
}
