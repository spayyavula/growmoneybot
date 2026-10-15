import { StyleSheet, Text, View } from "react-native";
import { fmt } from "@gmb/core";
import { colors, radius, signColor, space } from "../theme.js";
import { Muted } from "./ui.js";

export function MetricsGrid({ m }) {
  if (!m) return null;
  const items = [
    { label: "Net profit", value: fmt.money(m.netProfit), sub: fmt.pct(m.netProfitPct), color: signColor(m.netProfit) },
    { label: "Buy & hold", value: fmt.pct(m.buyHoldPct), color: signColor(m.buyHoldPct) },
    { label: "Max drawdown", value: fmt.pct(m.maxDrawdownPct), color: m.maxDrawdownPct > 0 ? colors.neg : colors.ink },
    { label: "Trades", value: fmt.num(m.totalTrades, 0), sub: `${fmt.pct(m.winRatePct, 1)} win rate` },
    { label: "Profit factor", value: fmt.num(m.profitFactor) },
    { label: "Sharpe", value: fmt.num(m.sharpe) },
    { label: "CAGR", value: fmt.pct(m.cagrPct), color: signColor(m.cagrPct) },
    { label: "Time in market", value: fmt.pct(m.exposurePct, 1) },
    ...(m.openPnl ? [{ label: "Open P&L", value: fmt.money(m.openPnl), color: signColor(m.openPnl) }] : []),
  ];
  return (
    <View style={st.grid}>
      {items.map((it) => (
        <View key={it.label} style={st.metric}>
          <Text style={st.label}>{it.label}</Text>
          <Text style={[st.value, it.color && { color: it.color }]}>{it.value}</Text>
          {it.sub ? <Text style={st.sub}>{it.sub}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function TradesList({ trades, openTrade, intraday }) {
  if (!trades?.length && !openTrade) return <Muted>No trades — the entry rules never triggered on this data.</Muted>;
  const d = (t) => fmt.date(t, intraday);
  const rows = [...trades].reverse().slice(0, 200);
  return (
    <View style={{ gap: space.sm }}>
      {openTrade && (
        <View style={[st.trade, { backgroundColor: "#f1f5ff" }]}>
          <View style={st.tradeHead}>
            <Text style={st.tradeTitle}>Open {openTrade.direction}</Text>
            <Text style={[st.pnl, { color: signColor(openTrade.unrealizedPnl) }]}>{fmt.money(openTrade.unrealizedPnl, 2)}</Text>
          </View>
          <Text style={st.tradeLine}>Entered {d(openTrade.entryTime)} at {fmt.price(openTrade.entryPrice)}</Text>
        </View>
      )}
      {rows.map((t, i) => (
        <View key={`${t.entryTime}-${i}`} style={st.trade}>
          <View style={st.tradeHead}>
            <Text style={st.tradeTitle}>#{trades.length - i} · {t.direction}</Text>
            <Text style={[st.pnl, { color: signColor(t.pnl) }]}>{fmt.money(t.pnl, 2)} ({fmt.pct(t.pnlPct)})</Text>
          </View>
          <Text style={st.tradeLine}>In  {d(t.entryTime)} · {fmt.price(t.entryPrice)}</Text>
          <Text style={st.tradeLine}>Out {d(t.exitTime)} · {fmt.price(t.exitPrice)} · {t.reason}</Text>
        </View>
      ))}
      {trades.length > rows.length && <Muted small>Showing the latest {rows.length} of {trades.length} trades.</Muted>}
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md },
  metric: { flexBasis: "47%", flexGrow: 1, backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: space.md },
  label: { fontSize: 12, color: colors.muted },
  value: { fontSize: 19, fontWeight: "700", color: colors.ink, marginTop: 2 },
  sub: { fontSize: 12, color: colors.muted },
  trade: { borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, backgroundColor: colors.paper, gap: 2 },
  tradeHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2, gap: space.sm },
  tradeTitle: { fontSize: 15, fontWeight: "700", color: colors.ink, textTransform: "capitalize" },
  pnl: { fontSize: 14, fontWeight: "700" },
  tradeLine: { fontSize: 13, color: colors.muted },
});
