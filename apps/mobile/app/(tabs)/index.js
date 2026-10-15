import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { INTERVALS, fmt } from "@gmb/core";
import { api } from "../../src/api.js";
import { Button, Card, Muted } from "../../src/components/ui.js";
import { colors, fonts, signColor, space } from "../../src/theme.js";

export default function Strategies() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api.listStrategies();
      setItems(d.strategies);
      setError("");
    } catch (e) { setError(e.message); }
  }, []);

  // Reload whenever the tab comes back into view (e.g. after editing a strategy)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const refresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const confirmDelete = (s) =>
    Alert.alert("Delete strategy?", `"${s.name}" will be removed. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        try { await api.deleteStrategy(s._id); setItems((xs) => xs.filter((x) => x._id !== s._id)); }
        catch (e) { Alert.alert("Couldn't delete", e.message); }
      } },
    ]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={items || []}
        keyExtractor={(s) => s._id}
        contentContainerStyle={{ padding: space.lg, paddingBottom: 96 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.forest} />}
        ListHeaderComponent={error ? <Text style={st.error}>{error}</Text> : null}
        ListEmptyComponent={
          items === null ? <Muted>Loading…</Muted> : (
            <Card style={{ alignItems: "center", paddingVertical: space.xl }}>
              <Text style={st.emptyTitle}>No strategies yet</Text>
              <Muted style={{ textAlign: "center", marginBottom: space.lg }}>
                Start from a template like an EMA crossover or RSI bounce, then tweak it.
              </Muted>
              <Button title="Create your first strategy" onPress={() => router.push("/strategy/new")} />
            </Card>
          )
        }
        renderItem={({ item: s }) => {
          const m = s.lastBacktest?.metrics;
          return (
            <Pressable
              onPress={() => router.push(`/strategy/${s._id}`)}
              onLongPress={() => confirmDelete(s)}
              accessibilityHint="Long-press to delete"
              style={({ pressed }) => [st.card, pressed && { opacity: 0.85 }]}
            >
              <Text style={st.name} numberOfLines={1}>{s.name}</Text>
              <Muted small>{s.symbol} · {INTERVALS.find((i) => i.key === s.interval)?.label ?? s.interval} · {s.direction}</Muted>
              {m ? (
                <View style={st.metrics}>
                  <Metric label="Net" value={fmt.pct(m.netProfitPct, 1)} color={signColor(m.netProfitPct)} />
                  <Metric label="Max DD" value={fmt.pct(m.maxDrawdownPct, 1)} />
                  <Metric label="Trades" value={fmt.num(m.totalTrades, 0)} />
                  <Metric label="Win rate" value={fmt.pct(m.winRatePct, 0)} />
                </View>
              ) : <Muted small style={{ marginTop: space.sm }}>Not backtested yet</Muted>}
              <Muted small style={{ marginTop: space.sm, fontSize: 12 }}>Updated {fmt.ago(s.updatedAt)}</Muted>
            </Pressable>
          );
        }}
      />
      {items?.length > 0 && (
        <Button title="+ New strategy" onPress={() => router.push("/strategy/new")} style={st.fab} />
      )}
    </View>
  );
}

const Metric = ({ label, value, color }) => (
  <View style={{ flex: 1 }}>
    <Text style={{ fontSize: 11, color: colors.muted }}>{label}</Text>
    <Text style={{ fontSize: 15, fontWeight: "700", color: color || colors.ink }}>{value}</Text>
  </View>
);

const st = StyleSheet.create({
  card: { backgroundColor: colors.paper, borderRadius: 18, borderWidth: 1, borderColor: colors.line, padding: space.lg, marginBottom: space.md },
  name: { fontFamily: fonts.serif, fontSize: 21, fontWeight: "700", color: colors.forest, marginBottom: 2 },
  metrics: { flexDirection: "row", marginTop: space.md, gap: space.sm },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: space.sm },
  error: { color: colors.danger, marginBottom: space.md },
  fab: { position: "absolute", right: space.lg, bottom: space.lg, shadowColor: colors.forest, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
});
