import { createApi } from "@gmb/core";
import { getItem } from "./storage.js";

export const TOKEN_KEY = "gmb_token";

// Set EXPO_PUBLIC_API_URL in apps/mobile/.env (or eas.json) to point at another server.
export const API_URL = (process.env.EXPO_PUBLIC_API_URL || "https://growmoneybot.com/api").replace(/\/$/, "");
export const SITE_ORIGIN = API_URL.replace(/\/api$/, "");

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

export const api = createApi({
  baseUrl: API_URL,
  getToken: () => getItem(TOKEN_KEY),
  onUnauthorized: () => onUnauthorized(),
});
