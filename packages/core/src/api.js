/**
 * GrowMoneyBot API client shared by the web app and the Expo app.
 *
 *   const api = createApi({
 *     baseUrl: "/api",                       // web; mobile uses "https://growmoneybot.com/api"
 *     getToken: () => token,                 // may be async (SecureStore)
 *     onUnauthorized: () => logout(),
 *   });
 */
export function createApi({ baseUrl = "/api", getToken = () => null, onUnauthorized = () => {} } = {}) {
  async function request(path, { method = "GET", body, auth = true } = {}) {
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    const token = auth ? await getToken() : null;
    if (token) headers.Authorization = `Bearer ${token}`;

    let res;
    try {
      res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      throw new Error("Can't reach GrowMoneyBot. Check your connection and try again.");
    }
    let data;
    try { data = await res.json(); } catch { data = { ok: false, error: "Unexpected server response" }; }
    if (res.status === 401 && token) onUnauthorized();
    if (!res.ok || data.ok === false) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  const q = (params) => new URLSearchParams(params).toString();

  return {
    request,
    // Landing page
    joinWaitlist: (body) => request("/subscribers", { method: "POST", body, auth: false }),
    getWaitlistCount: () => request("/subscribers/count", { auth: false }),
    sendContact: (body) => request("/contact", { method: "POST", body, auth: false }),

    // Auth & account
    signup: (body) => request("/auth/signup", { method: "POST", body, auth: false }),
    login: (body) => request("/auth/login", { method: "POST", body, auth: false }),
    me: () => request("/auth/me"),
    updateSettings: (body) => request("/auth/settings", { method: "PUT", body }),
    rotateWebhookToken: () => request("/auth/webhook-token", { method: "POST" }),
    deleteAccount: (password) => request("/auth/account", { method: "DELETE", body: { password } }),

    // Push notification devices
    registerDevice: (body) => request("/devices", { method: "POST", body }),
    unregisterDevice: (token) => request("/devices", { method: "DELETE", body: { token } }),

    // Strategies
    listStrategies: () => request("/strategies"),
    getStrategy: (id) => request(`/strategies/${id}`),
    createStrategy: (body) => request("/strategies", { method: "POST", body }),
    updateStrategy: (id, body) => request(`/strategies/${id}`, { method: "PUT", body }),
    deleteStrategy: (id) => request(`/strategies/${id}`, { method: "DELETE" }),
    saveBacktestSummary: (id, metrics) => request(`/strategies/${id}/backtest`, { method: "POST", body: { metrics } }),

    // Pine scripts (web Pine Lab)
    listPine: () => request("/pine"),
    createPine: (body) => request("/pine", { method: "POST", body }),
    updatePine: (id, body) => request(`/pine/${id}`, { method: "PUT", body }),
    deletePine: (id) => request(`/pine/${id}`, { method: "DELETE" }),

    // Market data & signals
    getCandles: ({ market, symbol, interval, bars }) =>
      request(`/market/candles?${q({ market, symbol, interval, bars: String(bars) })}`),
    // Expert program
    getExpertMe: () => request("/experts/me"),
    applyExpert: (body) => request("/experts/apply", { method: "POST", body }),
    updateExpertProfile: (body) => request("/experts/me", { method: "PUT", body }),
    getExpert: (id) => request(`/experts/${id}`),

    // Marketplace (browsing works without logging in)
    listMarketplace: (params = {}) => request(`/marketplace?${q(params)}`),
    listFollowing: () => request("/marketplace/following"),
    listMyAlgorithms: () => request("/marketplace/mine"),
    getAlgorithm: (id) => request(`/marketplace/${id}`),
    publishAlgorithm: (body) => request("/marketplace", { method: "POST", body }),
    updateAlgorithm: (id, body) => request(`/marketplace/${id}`, { method: "PUT", body }),
    republishAlgorithm: (id, body) => request(`/marketplace/${id}/republish`, { method: "POST", body }),
    followAlgorithm: (id) => request(`/marketplace/${id}/follow`, { method: "POST" }),
    unfollowAlgorithm: (id) => request(`/marketplace/${id}/follow`, { method: "DELETE" }),
    setAlgorithmAlerts: (id, notify) => request(`/marketplace/${id}/follow`, { method: "PUT", body: { notify } }),
    copyAlgorithm: (id) => request(`/marketplace/${id}/copy`, { method: "POST" }),
    getAlgorithmDataset: (id) => request(`/marketplace/${id}/dataset`),

    // Admin review
    adminListExperts: (status) => request(`/admin/experts?${q({ status })}`),
    adminReviewExpert: (id, action, note) => request(`/admin/experts/${id}/${action}`, { method: "POST", body: { note } }),
    adminListAlgorithms: (status) => request(`/admin/algorithms?${q({ status })}`),
    adminRemoveAlgorithm: (id, reason) => request(`/admin/algorithms/${id}/remove`, { method: "POST", body: { reason } }),
    adminRestoreAlgorithm: (id) => request(`/admin/algorithms/${id}/restore`, { method: "POST" }),

    listSignals: (strategyId) => request(`/signals${strategyId ? `?${q({ strategyId })}` : ""}`),
    clearSignals: () => request("/signals", { method: "DELETE" }),
  };
}

// Personal TradingView webhook URL for a user
export const webhookUrl = (origin, user) => `${origin.replace(/\/$/, "")}/api/webhooks/tv/${user?.webhookToken ?? ""}`;
