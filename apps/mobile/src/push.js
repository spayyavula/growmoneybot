// Push notifications for TradingView alerts (Expo push service -> APNs / FCM).
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { api } from "./api.js";
import { getItem, setItem } from "./storage.js";

const PUSH_KEY = "gmb_push_token";

if (Platform.OS !== "web") {
  // Show alerts as banners even while the app is open
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
}

/** Ask for permission, get this phone's Expo push token and register it with the API. */
export async function enablePush() {
  if (Platform.OS === "web") throw new Error("Push notifications work in the iOS and Android apps.");
  if (!Device.isDevice) throw new Error("Push notifications need a real phone, not a simulator.");

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("alerts", {
      name: "TradingView alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 200, 120, 200],
      lightColor: "#c8f169",
    });
  }

  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") ({ status } = await Notifications.requestPermissionsAsync());
  if (status !== "granted") throw new Error("Notifications are turned off for GrowMoneyBot in your phone's Settings.");

  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error("This build has no EAS project ID yet (run `eas init`).");

  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api.registerDevice({ token, platform: Platform.OS, name: Device.deviceName || Device.modelName || "" });
  await setItem(PUSH_KEY, token);
  return token;
}

/** Remove this phone from the account (on logout or when notifications are switched off). */
export async function disablePush() {
  const token = await getItem(PUSH_KEY);
  if (!token) return;
  try { await api.unregisterDevice(token); } catch { /* offline — server prunes dead tokens later */ }
  await setItem(PUSH_KEY, null);
}

export const hasPushToken = async () => Boolean(await getItem(PUSH_KEY));
