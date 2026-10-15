import { useEffect, useState } from "react";
import { Alert, Linking, Modal, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { webhookUrl } from "@gmb/core";
import { api, SITE_ORIGIN } from "../../src/api.js";
import { useAuth } from "../../src/auth.js";
import { enablePush, disablePush, hasPushToken } from "../../src/push.js";
import { Button, Card, Field, Input, Muted, s as ui } from "../../src/components/ui.js";
import { colors, space } from "../../src/theme.js";

export default function Account() {
  const { user, setUser, logout } = useAuth();
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = webhookUrl(SITE_ORIGIN, user);
  const [deleting, setDeleting] = useState(false);
  const [password, setPassword] = useState("");
  const [delError, setDelError] = useState("");

  useEffect(() => {
    hasPushToken().then((has) => setPushOn(has && user?.notifyOnSignals !== false));
  }, [user?.notifyOnSignals]);

  const togglePush = async (on) => {
    setBusy(true);
    try {
      if (on) {
        await enablePush();
        if (user?.notifyOnSignals === false) setUser((await api.updateSettings({ notifyOnSignals: true })).user);
      } else {
        await disablePush();
      }
      setPushOn(on);
    } catch (e) {
      Alert.alert("Notifications", e.message);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => { await Clipboard.setStringAsync(url); setCopied(true); setTimeout(() => setCopied(false), 1800); };

  const rotate = () =>
    Alert.alert("Create a new webhook URL?", "Existing TradingView alerts will stop delivering until you update them with the new URL.", [
      { text: "Cancel", style: "cancel" },
      { text: "Create new URL", style: "destructive", onPress: async () => {
        try { setUser((await api.rotateWebhookToken()).user); } catch (e) { Alert.alert("Error", e.message); }
      } },
    ]);

  const confirmLogout = () =>
    Alert.alert("Log out?", "This phone will stop receiving your alert notifications.", [
      { text: "Cancel", style: "cancel" },
      { text: "Log out", style: "destructive", onPress: logout },
    ]);

  const deleteAccount = async () => {
    setDelError("");
    try {
      await api.deleteAccount(password);
      setDeleting(false);
      await logout();
    } catch (e) { setDelError(e.message); }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}>
      <Card>
        <Text style={st.name}>{user?.name || "Your account"}</Text>
        <Muted>{user?.email}</Muted>
      </Card>

      <Card>
        <View style={st.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.title}>Alert notifications</Text>
            <Muted small>Get a push notification on this phone each time a TradingView alert arrives.</Muted>
          </View>
          <Switch
            value={pushOn} onValueChange={togglePush} disabled={busy}
            trackColor={{ true: colors.forest2, false: colors.line }} thumbColor={colors.paper}
            accessibilityLabel="Alert notifications"
          />
        </View>
      </Card>

      <Card>
        <Text style={st.title}>TradingView webhook URL</Text>
        <Text selectable style={[ui.mono, st.url]}>{url}</Text>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button title={copied ? "Copied!" : "Copy"} small onPress={copy} style={{ flex: 1 }} />
          <Button title="New URL" variant="ghost" small onPress={rotate} style={{ flex: 1 }} />
        </View>
        <Muted small style={{ marginTop: space.sm }}>Keep this private — anyone with it can post alerts to your account.</Muted>
      </Card>

      <Card>
        <Text style={st.title}>Pine Lab</Text>
        <Muted small style={{ marginBottom: space.md }}>Run your own Pine scripts on the GrowMoneyBot website.</Muted>
        <Button title="Open growmoneybot.com" variant="ghost" small onPress={() => Linking.openURL(`${SITE_ORIGIN}/app/pine`)} />
      </Card>

      <Button title="Log out" variant="danger" onPress={confirmLogout} style={{ marginTop: space.sm }} />

      <Button title="Delete account" variant="ghost" small onPress={() => { setPassword(""); setDelError(""); setDeleting(true); }} style={{ marginTop: space.md, alignSelf: "center", borderColor: "transparent" }} />

      <Modal visible={deleting} transparent animationType="fade" onRequestClose={() => setDeleting(false)}>
        <View style={st.modalWrap}>
          <Card style={{ width: "100%", maxWidth: 420 }}>
            <Text style={st.title}>Delete your account?</Text>
            <Muted small style={{ marginBottom: space.md }}>
              This permanently deletes your account, strategies, saved scripts and alerts. It can't be undone.
            </Muted>
            <Field label="Enter your password to confirm">
              <Input value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" />
            </Field>
            {delError ? <Text style={{ color: colors.danger, marginTop: space.sm }}>{delError}</Text> : null}
            <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
              <Button title="Cancel" variant="ghost" small onPress={() => setDeleting(false)} style={{ flex: 1 }} />
              <Button title="Delete" variant="danger" small onPress={deleteAccount} disabled={!password} style={{ flex: 1 }} />
            </View>
          </Card>
        </View>
      </Modal>

      <Muted small style={{ textAlign: "center", marginTop: space.xl }}>
        GrowMoneyBot {Constants.expoConfig?.version} · Educational tool, not financial advice.
        Backtest results are hypothetical. Not affiliated with TradingView.
      </Muted>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  name: { fontSize: 20, fontWeight: "700", color: colors.ink, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: space.md },
  url: { fontSize: 12, color: colors.ink, backgroundColor: colors.cream, borderRadius: 8, padding: space.sm, marginVertical: space.sm },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", alignItems: "center", padding: space.lg },
});
