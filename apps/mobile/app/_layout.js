import { useEffect } from "react";
import { Platform } from "react-native";
import { Stack, router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../src/auth.js";
import { colors } from "../src/theme.js";

SplashScreen.preventAutoHideAsync().catch(() => {});

function useNotificationTaps(enabled) {
  useEffect(() => {
    if (!enabled || Platform.OS === "web") return;
    const open = (response) => {
      const url = response?.notification?.request?.content?.data?.url;
      if (url) router.push(url);
    };
    // App opened from a notification while it was closed
    Notifications.getLastNotificationResponseAsync().then((r) => r && open(r)).catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener(open);
    return () => sub.remove();
  }, [enabled]);
}

function RootNavigator() {
  const { user, ready } = useAuth();

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);
  useNotificationTaps(Boolean(user));

  if (!ready) return null;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.paper },
        headerTintColor: colors.forest,
        headerTitleStyle: { fontWeight: "700", color: colors.ink },
        contentStyle: { backgroundColor: colors.cream },
        headerShadowVisible: false,
      }}
    >
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="strategy/[id]" options={{ title: "Strategy", headerBackTitle: "Back" }} />
      </Stack.Protected>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="signup" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
