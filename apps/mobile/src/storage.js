// Secure token storage: Keychain (iOS) / Keystore (Android) via expo-secure-store,
// localStorage when the app runs on the web (Expo web, used for previews).
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

const web = Platform.OS === "web";

export async function getItem(key) {
  if (web) { try { return localStorage.getItem(key); } catch { return null; } }
  return SecureStore.getItemAsync(key);
}

export async function setItem(key, value) {
  if (web) { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* blocked */ } return; }
  if (value == null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
