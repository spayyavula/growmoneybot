import { fmt } from "@gmb/core";

export function MetricsGrid({ m }) {
  if (!m) return null;
  const items = [
    { label: "Net profit", value: fmt.money(m.netProfit), sub: fmt.pct(m.netProfitPct), cls: fmt.signClass(m.netProfit) },
    { label: "Buy & hold", value: fmt.pct(m.buyHoldPct), cls: fmt.signClass(m.buyHoldPct) },
    { label: "Max drawdown", value: fmt.pct(m.maxDrawdownPct), cls: m.maxDrawdownPct > 0 ? "neg" : "" },
    { label: "Trades", value: fmt.num(m.totalTrades, 0), sub: `${fmt.pct(m.winRatePct, 1)} win rate` },
    { label: "Profit factor", value: fmt.num(m.profitFactor) },
    ...(m.sharpe !== undefined ? [{ label: "Sharpe", value: fmt.num(m.sharpe) }] : []),
    ...(m.cagrPct !== undefined ? [{ label: "CAGR", value: fmt.pct(m.cagrPct), cls: fmt.signClass(m.cagrPct) }] : []),
    ...(m.exposurePct !== undefined ? [{ label: "Time in market", value: fmt.pct(m.exposurePct, 1) }] : []),
    ...(m.openPnl ? [{ label: "Open P&L", value: fmt.money(m.openPnl), cls: fmt.signClass(m.openPnl) }] : []),
  ];
  return (
    <div className="metrics">
      {items.map((it) => (
        <div key={it.label} className="metric">
          <span className="metric-label">{it.label}</span>
          <strong className={it.cls}>{it.value}</strong>
          {it.sub && <span className="metric-sub">{it.sub}</span>}
        </div>
      ))}
    </div>
  );
}

// Cards on phones, a table on wider screens (see .table in app.css)
export function TradesTable({ trades, openTrade, intraday = false }) {
  if (!trades?.length && !openTrade) return <p className="muted">No trades — the entry rules never triggered on this data.</p>;
  const rows = [...trades].reverse();
  const d = (t) => fmt.date(t, intraday);
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr><th>#</th><th>Side</th><th>Entry</th><th>Entry price</th><th>Exit</th><th>Exit price</th><th>P&L</th><th>Exit reason</th></tr>
        </thead>
        <tbody>
          {openTrade && (
            <tr className="open-row">
              <td data-label="Trade">Open</td>
              <td data-label="Side">{openTrade.direction}</td>
              <td data-label="Entry">{d(openTrade.entryTime)}</td>
              <td data-label="Entry price">{fmt.price(openTrade.entryPrice)}</td>
              <td data-label="Exit">—</td>
              <td data-label="Exit price">—</td>
              <td data-label="Unrealized P&L" className={fmt.signClass(openTrade.unrealizedPnl)}>{fmt.money(openTrade.unrealizedPnl, 2)}</td>
              <td data-label="Status">still open</td>
            </tr>
          )}
          {rows.map((t, i) => (
            <tr key={`${t.entryTime}-${i}`}>
              <td data-label="Trade">#{trades.length - i}</td>
              <td data-label="Side">{t.direction}</td>
              <td data-label="Entry">{d(t.entryTime)}</td>
              <td data-label="Entry price">{fmt.price(t.entryPrice)}</td>
              <td data-label="Exit">{d(t.exitTime)}</td>
              <td data-label="Exit price">{fmt.price(t.exitPrice)}</td>
              <td data-label="P&L" className={fmt.signClass(t.pnl)}>{fmt.money(t.pnl, 2)} ({fmt.pct(t.pnlPct)})</td>
              <td data-label="Exit reason">{t.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
