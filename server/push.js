// Expo push notifications (iOS + Android) — https://docs.expo.dev/push-notifications/sending-notifications/
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export const isExpoPushToken = (t) => typeof t === "string" && /^Expo(nent)?PushToken\[[A-Za-z0-9_\-]+\]$/.test(t);

/**
 * Send one notification to several Expo push tokens.
 * Returns the tokens Expo reports as no longer registered, so the caller can remove them.
 * Never throws: a push failure must not fail the webhook that triggered it.
 */
export async function sendPush(tokens, { title, body, data }, { timeoutMs = 2500 } = {}) {
  const valid = tokens.filter(isExpoPushToken);
  if (!valid.length) return { dead: [] };

  const messages = valid.map((to) => ({ to, title, body, data, sound: "default", priority: "high", channelId: "alerts" }));
  const headers = { "Content-Type": "application/json", Accept: "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST", headers, body: JSON.stringify(messages), signal: AbortSignal.timeout(timeoutMs),
    });
    const json = await res.json().catch(() => ({}));
    const tickets = Array.isArray(json?.data) ? json.data : [];
    const dead = tickets
      .map((t, i) => (t?.status === "error" && t?.details?.error === "DeviceNotRegistered" ? valid[i] : null))
      .filter(Boolean);
    if (!res.ok) console.error("Expo push error", res.status, JSON.stringify(json).slice(0, 300));
    return { dead };
  } catch (err) {
    console.error("Expo push failed:", err.message);
    return { dead: [] };
  }
}

export function signalNotification(signal, strategyName) {
  const action = (signal.action || "alert").toUpperCase();
  const ticker = signal.ticker || "TradingView";
  const title = `${action} · ${ticker}`;
  const parts = [];
  if (signal.type) parts.push(signal.type === "entry" ? "Entry" : signal.type === "exit" ? "Exit" : signal.type);
  if (Number.isFinite(signal.price)) parts.push(`at ${signal.price}`);
  if (strategyName) parts.push(`— ${strategyName}`);
  const body = parts.length ? parts.join(" ") : (signal.raw || "New alert").slice(0, 140);
  return { title, body, data: { url: "/alerts", signalId: String(signal._id ?? "") } };
}
