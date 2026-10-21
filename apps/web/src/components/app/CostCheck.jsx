import { costCheck, fmt } from "@gmb/core";

const VERDICT = {
  ok: { cls: "", title: "The edge clears its costs" },
  thin: { cls: "warn", title: "Thin edge: costs take a big share" },
  negative: { cls: "bad", title: "Costs eat the whole edge" },
  none: { cls: "", title: "Not enough trades to judge costs" },
};

/** Does the average trade beat the round-trip cost? Plus the cash-account settlement check. */
export default function CostCheck({ m, settlement, strategy }) {
  if (!m) return null;
  const c = costCheck(m);
  const v = VERDICT[c.level];
  const cash = strategy.market === "stocks" && strategy.account === "cash";
  const share = c.movePct > 0 ? Math.min(100, (c.costPct / c.movePct) * 100) : null;

  return (
    <div className="cost-check">
      <div className={`cost-verdict ${v.cls}`}>
        <strong>{v.title}</strong>
        {c.level !== "none" ? (
          <span className="small">
            Each trade moves the price {fmt.pct(c.movePct)} in your favor on average; a round trip costs {fmt.pct(c.costPct)} in fees and slippage
            {Number.isFinite(c.ratio) && c.costPct > 0 ? ` (edge ${fmt.num(c.ratio, 1)}× cost)` : ""}.
            {c.level === "negative" && " After costs the average trade loses money, at any account size."}
            {c.level === "thin" && share != null && ` Costs take about ${fmt.num(share, 0)}% of what each trade makes. Aim for at least 2×.`}
          </span>
        ) : (
          <span className="small">The strategy made {c.trades} closed {c.trades === 1 ? "trade" : "trades"}; try more history.</span>
        )}
      </div>

      <dl className="cost-stats">
        <div><dt>Fees paid</dt><dd>{fmt.money(m.feesPaid, 2)}</dd></div>
        <div><dt>Slippage paid</dt><dd>{m.slippagePct > 0 ? fmt.money(m.slippagePaid, 2) : "not set"}</dd></div>
        <div><dt>Costs per round trip</dt><dd>{fmt.pct(c.costPct)}</dd></div>
      </dl>
      {!(m.slippagePct > 0) && (
        <p className="muted tiny">Add slippage under Risk &amp; costs (0.05% suits liquid markets) for a more realistic result.</p>
      )}

      {cash && settlement && (
        settlement.goodFaithViolations > 0 ? (
          <p className="note warn tiny">
            <b>Cash account:</b> {settlement.goodFaithViolations} {settlement.goodFaithViolations === 1 ? "trade was" : "trades were"} bought
            with sale proceeds that hadn't settled yet and sold the same day — a good-faith violation
            {settlement.restricted
              ? `. Up to ${settlement.maxIn12Months} in 12 months: three normally restrict the account to settled cash for 90 days, so these results aren't reachable in a cash account.`
              : ". Three in 12 months normally restricts the account for 90 days."}
            {" "}Consider a margin account ($2,000+) or rules that trade less often.
          </p>
        ) : (
          <p className="muted tiny">Cash account: no trade used unsettled funds (sale proceeds settle the next trading day).</p>
        )
      )}
    </div>
  );
}
