import { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { Link } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../auth.js";
import { Button, Field, Input, Muted } from "./ui.js";
import { colors, fonts, space } from "../theme.js";

export default function AuthForm({ mode }) {
  const isSignup = mode === "signup";
  const { login, signup } = useAuth();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setError("");
    if (!form.email.trim() || !form.password) return setError("Enter your email and password.");
    if (isSignup && form.password.length < 8) return setError("Password must be at least 8 characters.");
    setBusy(true);
    try {
      if (isSignup) await signup(form);
      else await login({ email: form.email, password: form.password });
      // The root navigator switches to the app once a user is set
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.cream }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
          <View style={st.brand}>
            <Image source={require("../../assets/icon.png")} style={st.logo} />
            <Text style={st.brandText}>GrowMoney<Text style={{ color: colors.forest2 }}>Bot</Text></Text>
          </View>
          <Text style={st.h1}>{isSignup ? "Create your account" : "Welcome back"}</Text>
          <Muted style={{ marginBottom: space.lg }}>
            {isSignup ? "Build and backtest trading strategies, and get your TradingView alerts as notifications." : "Log in to your strategies and alerts."}
          </Muted>

          <View style={{ gap: space.md }}>
            {isSignup && (
              <Field label="Name">
                <Input value={form.name} onChangeText={set("name")} autoComplete="name" textContentType="name" returnKeyType="next" />
              </Field>
            )}
            <Field label="Email">
              <Input
                value={form.email} onChangeText={set("email")} autoCapitalize="none" autoCorrect={false}
                keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next"
              />
            </Field>
            <Field label={isSignup ? "Password (8+ characters)" : "Password"}>
              <Input
                value={form.password} onChangeText={set("password")} secureTextEntry
                autoComplete={isSignup ? "new-password" : "current-password"}
                textContentType={isSignup ? "newPassword" : "password"} returnKeyType="go" onSubmitEditing={submit}
              />
            </Field>
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title={isSignup ? "Create account" : "Log in"} onPress={submit} loading={busy} />
            <Text style={st.switch}>
              {isSignup ? "Already have an account? " : "New here? "}
              <Link href={isSignup ? "/login" : "/signup"} replace style={st.link}>{isSignup ? "Log in" : "Create an account"}</Link>
            </Text>
          </View>
          <Muted small style={{ marginTop: space.xl, textAlign: "center" }}>
            Educational tool, not financial advice. Backtests are hypothetical.
          </Muted>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  wrap: { flexGrow: 1, justifyContent: "center", padding: space.xl, maxWidth: 480, width: "100%", alignSelf: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: space.xl },
  logo: { width: 40, height: 40, borderRadius: 10 },
  brandText: { fontSize: 20, fontWeight: "700", color: colors.ink },
  h1: { fontFamily: fonts.serif, fontSize: 30, fontWeight: "700", color: colors.forest, marginBottom: space.sm },
  error: { color: colors.danger, fontWeight: "500" },
  switch: { textAlign: "center", color: colors.muted, fontSize: 15, marginTop: space.sm },
  link: { color: colors.forest, fontWeight: "700" },
});
