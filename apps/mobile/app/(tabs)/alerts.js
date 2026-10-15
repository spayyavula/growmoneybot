import { useCallback, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { fmt, webhookUrl } from "@gmb/core";
import { api, SITE_ORIGIN } from "../../src/api.js";
import { useAuth } from "../../src/auth.js";
import { Button, Card, Muted, SectionTitle, s as ui } from "../../src/components/ui.js";
import { colors, radius, space } from "../../src/theme.js";

export default function Alerts() {
  const { user } = useAuth();
  const [signals, setSignals] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = webhookUrl(SITE_ORIGIN, user);

  const load = useCallback(async () => {
    try { setSignals((await api.listSignals()).signals); setError(""); }
    catch (e) { setError(e.message); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]));

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };
  const copy = async () => { await Clipboard.setStringAsync(url); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  const header = (
    <View>
      <Card>
        <Text style={st.cardTitle}>Your TradingView webhook URL</Text>
        <Text selectable style={[ui.mono, st.url]}>{url}</Text>
        <Button title={copied ? "Copied!" : "Copy URL"} small onPress={copy} />
        <Muted small style={{ marginTop: space.sm }}>
          In TradingView: Create alert → Notifications → Webhook URL. For strategies made here, set the message to
          {" {{strategy.order.alert_message}}"}. Turn on notifications in the Account tab to get a push for each alert.
        </Muted>
      </Card>
      {!user?.notifyOnSignals && (
        <Card style={{ backgroundColor: colors.warnBg, borderColor: colors.warnLine }}>
          <Text style={{ color: colors.warnText }}>Push notifications are off.</Text>
          <Button title="Turn on in Account" variant="ghost" small onPress={() => router.push("/account")} style={{ marginTop: space.sm, alignSelf: "flex-start" }} />
        </Card>
      )}
      <SectionTitle>Received alerts</SectionTitle>
      {error ? <Text style={{ color: colors.danger, marginBottom: space.sm }}>{error}</Text> : null}
    </View>
  );

  return (
    <FlatList
      data={signals || []}
      keyExtractor={(x) => x._id}
      contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}
      ListHeaderComponent={header}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.forest} />}
      ListEmptyComponent={<Muted>{signals === null ? "Loading…" : "No alerts yet. When your TradingView alert fires, it shows up here."}</Muted>}
      renderItem={({ item: x }) => {
        const buy = x.action === "buy";
        return (
          <View style={st.row}>
            <View style={st.rowHead}>
              {x.action ? (
                <Text style={[st.pill, buy ? st.buy : st.sell]}>{x.action.toUpperCase()}{x.type ? ` · ${x.type}` : ""}</Text>
              ) : <Text style={[st.pill, { backgroundColor: colors.cream, color: colors.muted }]}>ALERT</Text>}
              <Muted small>{new Date(x.createdAt).toLocaleString()}</Muted>
            </View>
            {x.ticker ? <Text style={st.ticker}>{x.exchange ? `${x.exchange}:` : ""}{x.ticker || "—"}{x.price != null ? `  @ ${fmt.price(x.price)}` : ""}{x.interval ? `  · ${x.interval}` : ""}</Text> : null}
            {!x.action && x.raw ? <Text style={[ui.mono, { fontSize: 12, color: colors.muted }]} numberOfLines={4}>{x.raw}</Text> : null}
          </View>
        );
      }}
    />
  );
}

const st = StyleSheet.create({
  cardTitle: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: space.sm },
  url: { fontSize: 12, color: colors.ink, backgroundColor: colors.cream, borderRadius: 8, padding: space.sm, marginBottom: space.md },
  row: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, gap: 4 },
  rowHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm },
  pill: { fontSize: 12, fontWeight: "700", paddingHorizontal: 9, paddingVertical: 2, borderRadius: 99, overflow: "hidden" },
  buy: { backgroundColor: "#def5e8", color: "#0e6b45" },
  sell: { backgroundColor: "#fde4e1", color: "#a1291f" },
  ticker: { fontSize: 16, fontWeight: "600", color: colors.ink },
});
