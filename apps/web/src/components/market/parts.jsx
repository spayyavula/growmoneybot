import { Link, useLocation } from "react-router-dom";
import { OPERATORS, INTERVALS, operandLabel, fmt, TARGET_VOL_PCT } from "@gmb/core";
import { RiskMeter, riskAdjHint } from "./charts.jsx";

// Marketplace pages live both publicly (/marketplace) and inside the app (/app/marketplace).
export function useMarketBase() {
  const { pathname } = useLocation();
  const inApp = pathname.startsWith("/app");
  return {
    inApp,
    market: inApp ? "/app/marketplace" : "/marketplace",
    expert: (id) => (inApp ? `/app/experts/${id}` : `/experts/${id}`),
  };
}

export const intervalLabel = (k) => INTERVALS.find((i) => i.key === k)?.label ?? k;

export function VerifiedSeal({ size = 16, title = "Verified by GrowMoneyBot" }) {
  return (
    <svg className="seal" width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={title}>
      <title>{title}</title>
      <path fill="currentColor" d="M12 1.5l2.4 1.8 3-.2.9 2.9 2.5 1.7-.9 2.9.9 2.9-2.5 1.7-.9 2.9-3-.2L12 22.5l-2.4-1.8-3 .2-.9-2.9-2.5-1.7.9-2.9-.9-2.9 2.5-1.7.9-2.9 3 .2z" />
      <path fill="none" stroke="var(--on-seal, #fff)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" d="M8 12.3l2.6 2.6L16.2 9.3" />
    </svg>
  );
}

export function ExpertByline({ author, link = true }) {
  const { expert } = useMarketBase();
  if (!author) return null;
  const name = (
    <span className="byline-name">
      {author.displayName}
      <VerifiedSeal size={14} title="Approved expert" />
    </span>
  );
  return link ? <Link to={expert(author.id)} className="byline">{name}</Link> : <span className="byline">{name}</span>;
}

export function Sparkline({ values = [], className = "" }) {
  if (values.length < 2) return <div className={`spark-empty ${className}`} />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${30 - ((v - min) / span) * 28 - 1}`).join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg className={`sparkline ${up ? "up" : "down"} ${className}`} viewBox="0 0 100 30" preserveAspectRatio="none" aria-hidden="true">
      <polygon points={`0,30 ${pts} 100,30`} className="spark-fill" />
      <polyline points={pts} className="spark-line" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export const Pct = ({ v, digits = 1 }) => <span className={fmt.signClass(v)}>{Number.isFinite(v) && v > 0 ? "+" : ""}{fmt.pct(v, digits)}</span>;

export function AlgoCard({ a }) {
  const { market } = useMarketBase();
  const lm = a.live?.metrics, vm = a.verified?.metrics || {};
  const vr = a.verified?.risk || {}, lr = a.live?.risk;
  return (
    <article className="algo-card">
      <Link to={`${market}/${a._id}`} className="algo-link" aria-label={`${a.name} by ${a.author?.displayName}`} />
      <div className="algo-top">
        <div className="algo-title">
          <h3>{a.name}</h3>
          <ExpertByline author={a.author} />
        </div>
        <span className="chip-static">{a.symbol} · {intervalLabel(a.interval)}</span>
      </div>
      <p className="algo-summary">{a.summary}</p>
      <Sparkline values={a.verified?.spark} />
      <dl className="algo-stats">
        <div>
          <dt>Live since {fmt.date(Math.floor(new Date(a.live?.since || a.publishedAt).getTime() / 1000))}</dt>
          <dd>{a.live?.started && lm ? <Pct v={lm.totalReturnPct} /> : <span className="muted">Waiting for first bar</span>}</dd>
        </div>
        <div>
          <dt>Verified backtest</dt>
          <dd><Pct v={vm.totalReturnPct} /></dd>
        </div>
        <div title={riskAdjHint}>
          <dt>At {TARGET_VOL_PCT}% volatility</dt>
          <dd>
            {!a.live?.lowSample && lr?.riskAdjReturnPct != null
              ? <><Pct v={lr.riskAdjReturnPct} /> <span className="dd-note">live</span></>
              : <><Pct v={vr.riskAdjReturnPct} /> <span className="dd-note">backtest</span></>}
          </dd>
        </div>
        <div>
          <dt>Max drawdown · risk</dt>
          <dd className="dd-risk">{fmt.pct(vm.maxDrawdownPct, 1)} <RiskMeter rating={vr.rating} compact /></dd>
        </div>
      </dl>
      <div className="algo-foot">
        <span className="verified-tag"><VerifiedSeal size={14} /> Verified</span>
        <span className="muted tiny">{fmt.num(a.followers, 0)} following · v{a.version}</span>
      </div>
    </article>
  );
}

// Read-only rules, written out the way a trader would say them
export function RulesView({ rules }) {
  if (!rules) return null;
  const op = (k) => OPERATORS.find((o) => o.key === k)?.label ?? k;
  const group = (title, g, empty) => (
    <div className="rules-read">
      <h4>{title} <span className="muted small">{g.conditions.length > 1 ? (g.logic === "any" ? "· any condition" : "· all conditions") : ""}</span></h4>
      {g.conditions.length ? (
        <ul>
          {g.conditions.map((c, i) => (
            <li key={i}><b>{operandLabel(c.left)}</b> {op(c.op)} <b>{operandLabel(c.right)}</b></li>
          ))}
        </ul>
      ) : <p className="muted small">{empty}</p>}
    </div>
  );
  const r = rules.risk || {};
  return (
    <div className="rules-view">
      <p className="small muted">{rules.direction === "short" ? "Short" : "Long"} · {rules.symbol} · {intervalLabel(rules.interval)} · {rules.market}</p>
      {group("Entry", rules.entry, "—")}
      {group("Exit", rules.exit, "Exits only with the stop loss or take profit.")}
      <div className="rules-read">
        <h4>Risk &amp; costs</h4>
        <ul className="risk-list">
          <li>Position size <b>{r.positionSizePct}%</b> of equity</li>
          <li>Fee <b>{r.feePct}%</b> per side</li>
          <li>Stop loss <b>{r.stopLossPct ? `${r.stopLossPct}%` : "off"}</b></li>
          <li>Take profit <b>{r.takeProfitPct ? `${r.takeProfitPct}%` : "off"}</b></li>
        </ul>
      </div>
    </div>
  );
}

export const shortHash = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "—");
