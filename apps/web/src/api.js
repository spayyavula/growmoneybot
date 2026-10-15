// Web API client: the shared client from @gmb/core with the token kept in localStorage.
import { createApi } from "@gmb/core";

const TOKEN_KEY = "gmb_token";

export const getToken = () => {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
};
export const setToken = (t) => {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* storage blocked */ }
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export const api = createApi({ baseUrl: "/api", getToken, onUnauthorized: () => onUnauthorized() });

export const {
  joinWaitlist, getWaitlistCount, sendContact,
  signup, login, me, updateSettings, rotateWebhookToken,
  listStrategies, getStrategy, createStrategy, updateStrategy, deleteStrategy, saveBacktestSummary,
  listPine, createPine, updatePine, deletePine,
  getCandles, listSignals, clearSignals,
} = api;
