import { costCheck, fmt } from "@gmb/core";

const legName = (l) => `${l.side > 0 ? "Buy" : "Sell"} ${fmt.price(l.strike)} ${l.type}`;
const expiryLabel = (t) => new Date(t * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const REASON = { signal: "exit rule", expiry: "expired", "take profit": "take profit", "stop loss": "stop loss" };

/** Profit/loss at expiry across stock prices, for one contract. */
function PayoffChart({ preview }) {
  const pts = preview.payoff;
  const W = 640, H = 220, L = 56, R = 14, T = 14, B = 34;
  const xs = pts.map((p) => p.S), ys = pts.map((p) => p.pnl);
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yMax = Math.max(...ys, 0), yMin = Math.min(...ys, 0);
  const pad = (yMax - yMin) * 0.08 || 10;
  const y0 = yMin - pad, y1 = yMax + pad;
  const X = (v) => L + ((v - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${X(p.S).toFixed(1)},${Y(p.pnl).toFixed(1)}`).join(" ");
  const zero = Y(0);
  const area = (above) => {
    const clip = pts.map((p) => ({ S: p.S, v: above ? Math.max(0, p.pnl) : Math.min(0, p.pnl) }));
    return `M${X(clip[0].S)},${zero} ` + clip.map((p) => `L${X(p.S).toFixed(1)},${Y(p.v).toFixed(1)}`).join(" ") + ` L${X(clip[clip.length - 1].S)},${zero} Z`;
  };
  const xTicks = Array.from({ length: 5 }, (_, i) => x0 + ((x1 - x0) * i) / 4);
  const yTicks = [yMin, 0, yMax].filter((v, i, a) => a.indexOf(v) === i);
  const now = preview.underlying;
  return (
    <div className="payoff-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="payoff" role="img" aria-label="Profit or loss at expiry for one contract across stock prices">
        <path d={area(true)} style={{ fill: "var(--accent-tint)" }} />
        <path d={area(false)} style={{ fill: "var(--danger-tint)" }} />
        <line x1={L} x2={W - R} y1={zero} y2={zero} style={{ stroke: "var(--sep-strong)" }} />
        {yTicks.map((v) => (
          <text key={v} x={L - 8} y={Y(v) + 4} textAnchor="end" className="payoff-tick">{fmt.money(v)}</text>
        ))}
        {xTicks.map((v) => (
          <text key={v} x={X(v)} y={H - 12} textAnchor="middle" className="payoff-tick">{fmt.price(Math.round(v))}</text>
        ))}
        <line x1={X(now)} x2={X(now)} y1={T} y2={H - B} style={{ stroke: "var(--label-3)", strokeDasharray: "3 4" }} />
        <text x={X(now) + 5} y={T + 10} className="payoff-tick">now {fmt.price(now)}</text>
        {preview.breakeven > x0 && preview.breakeven < x1 && (
          <circle cx={X(preview.breakeven)} cy={zero} r="4" style={{ fill: "var(--bg-elev)", stroke: "var(--label)", strokeWidth: 1.5 }} />
        )}
        <path d={line} style={{ fill: "none", stroke: "var(--label)", strokeWidth: 2 }} />
      </svg>
    </div>
  );
}

export function OptionsPreview({ preview, capital, settings }) {
  if (!preview) return <p className="muted small">Not enough history yet to estimate volatility. Load more bars.</p>;
  const p = preview;
  return (
    <div className="opt-preview">
      <div className="opt-preview-head">
        <h4>If the entry rule fired at the latest close</h4>
        <span className="muted small">{fmt.price(p.underlying)} · expires {expiryLabel(p.expiry)} ({p.dte} days) · implied vol estimate {fmt.pct(p.iv * 100, 1)}</span>
      </div>
      <ul className="opt-legs">
        {p.legs.map((l) => (
          <li key={`${l.side}${l.strike}`}><b>{legName(l)}</b> <span className="muted">at about {fmt.money(l.price, 2)}</span></li>
        ))}
      </ul>
      <dl className="opt-figures">
        <div><dt>Cost per contract</dt><dd>{fmt.money(p.perContract, 2)}</dd></div>
        <div><dt>Max loss</dt><dd className="neg">{fmt.money(p.maxLoss, 2)}</dd></div>
        <div><dt>Max profit</dt><dd className="pos">{p.maxProfit == null ? "Unlimited" : fmt.money(p.maxProfit, 2)}</dd></div>
        <div><dt>Breakeven at expiry</dt><dd>{fmt.price(p.breakeven)}</dd></div>
      </dl>
      <PayoffChart preview={p} />
      {p.affordableContracts < 1 ? (
        <p className="note warn tiny">
          One contract costs {fmt.money(p.perContract)}, more than {fmt.pct(settings.riskPct, 0)} of {fmt.money(capital)}.
          {settings.structure === "single" ? " Try a debit spread: it caps the cost." : " Try a narrower spread, a cheaper stock, or a higher max premium per trade."}
        </p>
      ) : (
        <p className="muted tiny">With {fmt.money(capital)} and a {fmt.pct(settings.riskPct, 0)} limit per trade, that's {p.affordableContracts} {p.affordableContracts === 1 ? "contract" : "contracts"}.</p>
      )}
    </div>
  );
}

export function OptionsCostCheck({ m }) {
  const c = costCheck(m);
  const title = { ok: "The edge clears its costs", thin: "Thin edge: costs take a big share", negative: "Costs eat the whole edge", none: "Not enough trades to judge costs" }[c.level];
  const cls = { ok: "", thin: "warn", negative: "bad", none: "" }[c.level];
  return (
    <div className="cost-check">
      <div className={`cost-verdict ${cls}`}>
        <strong>{title}</strong>
        <span className="small">
          {c.level === "none"
            ? `The strategy made ${c.trades} closed ${c.trades === 1 ? "trade" : "trades"}; try more history.`
            : `Before costs, the average trade made ${fmt.pct(c.movePct)} on the premium. Fees and the bid-ask spread took ${fmt.pct(c.costPct)} of it per round trip.`}
          {c.level === "thin" && " Aim for at least 2×."}
        </span>
      </div>
      <dl className="cost-stats">
        <div><dt>Fees paid</dt><dd>{fmt.money(m.feesPaid, 2)}</dd></div>
        <div><dt>Bid-ask paid</dt><dd>{fmt.money(m.slippagePaid, 2)}</dd></div>
        <div><dt>Expired worthless</dt><dd>{fmt.num(m.expiredWorthless, 0)}</dd></div>
      </dl>
    </div>
  );
}

export function OptionsTradesTable({ trades, openTrade, intraday }) {
  if (!trades?.length && !openTrade) return <p className="muted">No trades. The entry rules never fired, or every entry cost more than the limit per trade.</p>;
  const d = (t) => fmt.date(t, intraday);
  const rows = [...trades].reverse();
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>#</th><th>Position</th><th>Opened</th><th>Stock</th><th>Premium</th><th>Closed</th><th>Exit value</th><th>P&L</th><th>Why</th></tr>
        </thead>
        <tbody>
          {openTrade && (
            <tr className="open-row">
              <td data-label="Trade">Open</td>
              <td data-label="Position">{openTrade.contracts}× {openTrade.legs.map(legName).join(" / ")}</td>
              <td data-label="Opened">{d(openTrade.entryTime)}</td>
              <td data-label="Stock">{fmt.price(openTrade.underlyingEntry)}</td>
              <td data-label="Premium">{fmt.money(openTrade.cost, 2)}</td>
              <td data-label="Closed">expires {expiryLabel(openTrade.expiry)}</td>
              <td data-label="Exit value">—</td>
              <td data-label="Unrealized P&L" className={fmt.signClass(openTrade.unrealizedPnl)}>{fmt.money(openTrade.unrealizedPnl, 2)}</td>
              <td data-label="Status">still open</td>
            </tr>
          )}
          {rows.map((t, i) => (
            <tr key={`${t.entryTime}-${i}`}>
              <td data-label="Trade">#{trades.length - i}</td>
              <td data-label="Position">{t.contracts}× {t.legs.map(legName).join(" / ")}</td>
              <td data-label="Opened">{d(t.entryTime)}</td>
              <td data-label="Stock">{fmt.price(t.underlyingEntry)} → {fmt.price(t.underlyingExit)}</td>
              <td data-label="Premium">{fmt.money(t.cost, 2)}</td>
              <td data-label="Closed">{d(t.exitTime)}</td>
              <td data-label="Exit value">{fmt.money(t.exitPrice * 100 * t.contracts, 2)}</td>
              <td data-label="P&L" className={fmt.signClass(t.pnl)}>{fmt.money(t.pnl, 2)} <span className="muted">({fmt.pct(t.pnlPct, 0)})</span></td>
              <td data-label="Why">{REASON[t.reason] ?? t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function EstimateNote({ options }) {
  const a = options?.assumptions;
  return (
    <p className="note tiny">
      <b>Estimated option prices.</b> Priced with Black-Scholes from the stock's last {a?.volLookbackDays ?? 20} trading days of volatility
      × {a?.volMultiplier ?? 1.1}, a {fmt.pct(a?.ratePct ?? 4, 1)} interest rate and the bid-ask spread you set. Real prices also depend on
      implied volatility, skew and liquidity, so treat these results as a guide, not a record.
    </p>
  );
}
