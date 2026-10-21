import { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import {
  defaultStrategy, normalizeStrategy, TEMPLATES, INTERVALS, QUICK_SYMBOLS, runBacktest, generatePine,
  loadCandles, tradingViewUrl, isIntraday, strategyChartSeries, tradeMarkers, webhookUrl, fmt,
  SMALL_ACCOUNT_PRESETS, applySmallAccountPreset, costCheck,
} from "@gmb/core";
import { api, SITE_ORIGIN } from "../../src/api.js";
import { useAuth } from "../../src/auth.js";
import RuleEditor from "../../src/components/RuleEditor.js";
import PriceChart from "../../src/components/PriceChart";
import { phoneMarkers } from "../../src/components/chartHtml.js";
import { MetricsGrid, TradesList } from "../../src/components/Results.js";
import { Button, Card, Chip, Field, Input, Muted, Note, NumberField, SectionTitle, Segmented, Select, s as ui } from "../../src/components/ui.js";
import { colors, space } from "../../src/theme.js";

const VIEWS = [["rules", "Rules"], ["results", "Results"], ["pine", "Pine"]];
const INTERVAL_OPTIONS = INTERVALS.map((i) => ({ value: i.key, label: i.label }));
const tap = () => { if (Platform.OS !== "web") Haptics.selectionAsync().catch(() => {}); };

const COST_TITLE = {
  ok: "The edge clears its costs", thin: "Thin edge: costs take a big share",
  negative: "Costs eat the whole edge", none: "Not enough trades to judge costs",
};

// Does the average trade beat the round-trip cost? Plus the cash-account settlement check.
function CostSummary({ m, settlement, strategy }) {
  const c = costCheck(m);
  const bad = c.level === "negative" || c.level === "thin";
  const gfv = strategy.market === "stocks" && strategy.account === "cash" && settlement?.goodFaithViolations > 0;
  return (
    <View style={{ marginVertical: space.md, gap: space.sm }}>
      <Note warn={bad}>
        {COST_TITLE[c.level]}.{c.level !== "none" ? ` Average move per trade ${fmt.pct(c.movePct)} vs ${fmt.pct(c.costPct)} round-trip costs (fees ${fmt.money(m.feesPaid, 2)}${m.slippagePct > 0 ? `, slippage ${fmt.money(m.slippagePaid, 2)}` : ""}).` : ""}
        {c.level === "negative" ? " After costs the average trade loses money." : c.level === "thin" ? " Aim for at least 2×." : ""}
      </Note>
      {gfv && (
        <Note warn>
          Cash account: {settlement.goodFaithViolations} good-faith {settlement.goodFaithViolations === 1 ? "violation" : "violations"} (bought with unsettled funds and sold the same day).
          {settlement.restricted ? " Three in 12 months normally restricts the account for 90 days." : ""}
        </Note>
      )}
    </View>
  );
}

export default function StrategyScreen() {
  const { id } = useLocalSearchParams();
  const isNew = !id || id === "new";
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [s, setS] = useState(defaultStrategy);
  const [savedId, setSavedId] = useState(isNew ? null : id);
  const [loading, setLoading] = useState(!isNew);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState("rules");
  const [run, setRun] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.getStrategy(id)
      .then((d) => setS({ ...defaultStrategy(), ...d.strategy }))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  const set = (patch) => setS((prev) => ({ ...prev, ...patch }));
  const setRisk = (k, v) => setS((prev) => ({ ...prev, risk: { ...prev.risk, [k]: v } }));

  const pine = useMemo(() => {
    try { return generatePine(normalizeStrategy(s), { strategyId: savedId || "" }); }
    catch (e) { return `// Could not generate Pine Script: ${e.message}`; }
  }, [s, savedId]);

  const chartPayload = useMemo(() => {
    if (!run) return null;
    const { overlays, panes } = strategyChartSeries(run.candles, run.strategy);
    return {
      candles: run.candles.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })),
      overlays, panes, markers: phoneMarkers(tradeMarkers(run.result.trades, run.result.openTrade)),
    };
  }, [run]);
  const equityPayload = useMemo(() => (run ? { line: run.result.equity } : null), [run]);

  const save = async () => {
    setBusy("save"); setError("");
    const body = { ...normalizeStrategy(s), _id: undefined, user: undefined, lastBacktest: undefined };
    try {
      if (savedId) await api.updateStrategy(savedId, body);
      else {
        const d = await api.createStrategy(body);
        setSavedId(d.strategy._id);
        if (run) api.saveBacktestSummary(d.strategy._id, run.result.metrics).catch(() => {});
        router.setParams({ id: d.strategy._id });
      }
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { setError(e.message); }
    setBusy("");
  };

  const backtest = async () => {
    const clean = normalizeStrategy(s);
    if (!clean.entry.conditions.length) { setError("Add at least one entry condition."); setView("rules"); return; }
    setBusy("run"); setError("");
    try {
      const candles = await loadCandles(api, clean);
      await new Promise((r) => setTimeout(r, 0)); // let the spinner render
      const result = runBacktest(candles, clean);
      setRun({ candles, result, strategy: clean });
      setView("results");
      if (savedId) api.saveBacktestSummary(savedId, result.metrics).catch(() => {});
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (e) { setError(e.message); }
    setBusy("");
  };

  const copyPine = async () => { await Clipboard.setStringAsync(pine); setCopied(true); setTimeout(() => setCopied(false), 1800); };
  const sharePine = () => Share.share({ title: `${s.name} (Pine Script)`, message: pine }).catch(() => {});

  const remove = () =>
    Alert.alert("Delete strategy?", "This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.deleteStrategy(savedId); router.back(); } catch (e) { setError(e.message); }
      } },
    ]);

  if (loading) return <Muted style={{ padding: space.xl }}>Loading strategy…</Muted>;

  const shortWarning = s.direction === "short" && Number(s.risk.positionSizePct) > 50;

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: s.name || "Strategy" }} />
      <View style={st.viewBar}>
        <Segmented options={VIEWS} value={view} onChange={(v) => { tap(); setView(v); }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={100}>
        <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: 110 + insets.bottom }} keyboardShouldPersistTaps="handled">
          {error ? <Note warn>{error}</Note> : null}

          {view === "rules" && (
            <View>
              <Field label="Name"><Input value={s.name} maxLength={80} onChangeText={(name) => set({ name })} /></Field>
              {isNew && !savedId && (
                <Select
                  label="Start from a template" title="Templates" value={null}
                  options={TEMPLATES.map((t, i) => ({ value: i, label: t.name }))}
                  onChange={(i) => { setS(TEMPLATES[i].build()); setRun(null); }}
                  style={{ marginTop: space.md }}
                />
              )}

              <SectionTitle>Market</SectionTitle>
              <Segmented
                options={[["crypto", "Crypto"], ["stocks", "US stocks"]]}
                value={s.market === "stocks" ? "stocks" : "crypto"}
                onChange={(m) => set({ market: m, symbol: QUICK_SYMBOLS[m][0] })}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: space.sm, paddingVertical: space.md, alignItems: "center" }}>
                {QUICK_SYMBOLS[s.market === "stocks" ? "stocks" : "crypto"].map((sym) => (
                  <Chip key={sym} label={sym} on={s.symbol === sym} onPress={() => set({ symbol: sym })} />
                ))}
              </ScrollView>
              <View style={st.row}>
                <Field label="Symbol">
                  <Input
                    value={s.symbol} autoCapitalize="characters" autoCorrect={false}
                    onChangeText={(t) => set({ symbol: t.toUpperCase().replace(/[^A-Z0-9.\-]/g, "") })}
                  />
                </Field>
                <Select label="Timeframe" value={s.interval} options={INTERVAL_OPTIONS} onChange={(interval) => set({ interval })} />
              </View>
              <NumberField label="Bars of history (50–5000)" value={s.bars} decimals={false} onChange={(bars) => set({ bars })} style={{ marginTop: space.md }} />

              <SectionTitle>Direction</SectionTitle>
              <Segmented options={[["long", "Long"], ["short", "Short"]]} value={s.direction} onChange={(direction) => set({ direction })} />

              <SectionTitle>Rules</SectionTitle>
              <RuleEditor title="Entry" hint="Checked at each bar's close. Orders fill at the next bar's open." group={s.entry} onChange={(entry) => set({ entry })} />
              <RuleEditor title="Exit" hint="Leave empty to exit only with the stop loss or take profit." group={s.exit} onChange={(exit) => set({ exit })} />

              {s.instrument === "options" && (
                <Note>
                  This strategy trades options: each signal opens {s.options?.structure === "single" ? "a long call or put" : "a debit spread"}.
                  Backtests run here; change the options settings on the web. Option prices are model estimates.
                </Note>
              )}
              <SectionTitle>Risk & costs</SectionTitle>
              <Select
                label="Small account preset" value="" title="Small account preset"
                options={[{ value: "", label: "Choose a starting point…" }, ...SMALL_ACCOUNT_PRESETS.filter((p) => s.market === "csv" || p.market === s.market).map((p) => ({ value: p.key, label: p.label }))]}
                onChange={(key) => {
                  const p = SMALL_ACCOUNT_PRESETS.find((x) => x.key === key);
                  if (!p) return;
                  tap(); setS((prev) => applySmallAccountPreset(prev, key));
                  Alert.alert(p.label, p.note);
                }}
                style={{ marginBottom: space.md }}
              />
              {s.market === "stocks" && (
                <Segmented options={[["cash", "Cash account"], ["margin", "Margin account"]]} value={s.account || "margin"} onChange={(account) => set({ account })} style={{ marginBottom: space.md }} />
              )}
              <View style={st.row}>
                <NumberField label="Capital ($)" value={s.risk.initialCapital} onChange={(v) => setRisk("initialCapital", v)} />
                <NumberField label="Position size %" value={s.risk.positionSizePct} onChange={(v) => setRisk("positionSizePct", v)} />
              </View>
              <View style={[st.row, { marginTop: space.md }]}>
                <NumberField label="Fee per side %" value={s.risk.feePct} onChange={(v) => setRisk("feePct", v)} />
                <NumberField label="Slippage %" value={s.risk.slippagePct ?? 0} onChange={(v) => setRisk("slippagePct", v)} />
              </View>
              <View style={[st.row, { marginTop: space.md }]}>
                <NumberField label="Stop loss %" value={s.risk.stopLossPct} onChange={(v) => setRisk("stopLossPct", v)} />
                <NumberField label="Take profit %" value={s.risk.takeProfitPct} onChange={(v) => setRisk("takeProfitPct", v)} />
              </View>
              <Muted small style={{ marginTop: 4 }}>Set stop loss or take profit to 0 to turn it off.</Muted>
              {s.market === "stocks" && s.account === "cash" && s.direction === "short" && (
                <Note warn>Shorting stocks needs a margin account. A cash account can only buy and sell shares it owns.</Note>
              )}
              {shortWarning && (
                <Note warn>
                  Shorts above ~50% of equity can trigger margin calls on TradingView, which partially close the position.
                  This backtester doesn't simulate them, so TradingView's results may differ.
                </Note>
              )}
              <Field label="Notes" style={{ marginTop: space.md }}>
                <Input value={s.description} onChangeText={(description) => set({ description })} multiline style={{ minHeight: 80, paddingTop: 10, textAlignVertical: "top" }} placeholder="What's the idea behind this strategy?" />
              </Field>
              {savedId && <Button title="Delete strategy" variant="danger" small onPress={remove} style={{ marginTop: space.xl, alignSelf: "flex-start" }} />}
            </View>
          )}

          {view === "results" && (
            run ? (
              <View>
                <Muted small style={{ marginBottom: space.md }}>
                  {run.strategy.symbol} · {run.strategy.interval} · {run.candles.length} bars · {fmt.date(run.candles[0].time)} → {fmt.date(run.candles[run.candles.length - 1].time)}
                </Muted>
                <MetricsGrid m={run.result.metrics} />
                <CostSummary m={run.result.metrics} settlement={run.result.settlement} strategy={run.strategy} />
                <PriceChart payload={chartPayload} />
                <Muted small style={{ marginTop: 6 }}>Pinch to zoom, drag sideways to scroll back in time.</Muted>
                <SectionTitle>Equity</SectionTitle>
                <PriceChart payload={equityPayload} />
                <SectionTitle>Trades</SectionTitle>
                <TradesList trades={run.result.trades} openTrade={run.result.openTrade} intraday={isIntraday(run.candles)} />
              </View>
            ) : (
              <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
                <Text style={{ fontSize: 17, fontWeight: "600", textAlign: "center", marginBottom: space.sm }}>Run a backtest to see results</Text>
                <Muted style={{ textAlign: "center" }}>Results are hypothetical and based on past prices.</Muted>
              </Card>
            )
          )}

          {view === "pine" && (
            <View>
              <Muted style={{ marginBottom: space.md }}>
                A Pine Script v6 strategy with the same rules as the backtest. Paste it into TradingView's Pine Editor and tap “Add to chart”.
              </Muted>
              <View style={st.row}>
                <Button title={copied ? "Copied!" : "Copy"} small onPress={copyPine} style={{ flex: 1 }} />
                <Button title="Share…" variant="ghost" small onPress={sharePine} style={{ flex: 1 }} />
              </View>
              <Button title={`Open ${s.symbol} on TradingView`} variant="ghost" small onPress={() => Linking.openURL(tradingViewUrl(s))} style={{ marginTop: space.sm }} />
              {!savedId && <Note>Save the strategy first so its alerts can be matched to it.</Note>}
              <ScrollView horizontal style={st.code} contentContainerStyle={{ padding: space.md }}>
                <Text selectable style={[ui.mono, st.codeText]}>{pine}</Text>
              </ScrollView>

              <SectionTitle>Send alerts to this phone</SectionTitle>
              <Card>
                <Text style={st.step}>1. In TradingView, create an alert on this strategy.</Text>
                <Text style={st.step}>2. Set the message to <Text style={ui.mono}>{"{{strategy.order.alert_message}}"}</Text></Text>
                <Text style={st.step}>3. Turn on Webhook URL and paste:</Text>
                <Text selectable style={[ui.mono, st.url]}>{webhookUrl(SITE_ORIGIN, user)}</Text>
                <Muted small>Webhook alerts need a paid TradingView plan. Turn on notifications in the Account tab.</Muted>
              </Card>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[st.actionBar, { paddingBottom: Math.max(insets.bottom, space.md) }]}>
        <Button title="Save" variant="ghost" onPress={save} loading={busy === "save"} disabled={Boolean(busy)} style={{ flex: 1 }} />
        <Button title="Run backtest" onPress={backtest} loading={busy === "run"} disabled={Boolean(busy)} style={{ flex: 2 }} />
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  viewBar: { paddingHorizontal: space.lg, paddingVertical: space.sm, backgroundColor: colors.paper, borderBottomWidth: 1, borderBottomColor: colors.line },
  row: { flexDirection: "row", gap: space.sm },
  code: { backgroundColor: colors.code, borderRadius: 12, marginTop: space.md, maxHeight: 520 },
  codeText: { color: colors.codeText, fontSize: 12, lineHeight: 18 },
  step: { fontSize: 15, color: colors.ink, marginBottom: space.sm },
  url: { fontSize: 12, backgroundColor: colors.cream, borderRadius: 8, padding: space.sm, marginBottom: space.sm },
  actionBar: {
    position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: space.sm,
    paddingHorizontal: space.lg, paddingTop: space.md, backgroundColor: "rgba(247,245,238,0.97)",
    borderTopWidth: 1, borderTopColor: colors.line,
  },
});
