# GrowMoneyBot mobile app (Expo — iOS & Android)

Expo SDK 57 · React Native 0.86 · expo-router · JavaScript

| Tab / screen | What it does |
|---|---|
| **Strategies** | List with last backtest metrics, pull to refresh, long-press to delete, "+ New strategy" |
| **Strategy** | Rules · Results · Pine views. Build rules, run the backtest on the phone, see metrics, candlestick chart with trade markers and indicator panes, equity curve and trades; copy/share the Pine Script |
| **Alerts** | TradingView alerts received by your webhook, pull to refresh, webhook URL to copy |
| **Account** | Push notification switch, webhook URL (copy / new URL), link to Pine Lab on the web, log out |

The backtester, indicators, Pine generator and API client come from `packages/core`, shared with the web app,
so a strategy produces the same results and the same Pine Script on both.

Charts are TradingView's Lightweight Charts running inside a WebView (`src/components/PriceChart.js`).
The WebView loads the library from unpkg, so charts need a connection.

## Run it on your phone

```bash
# from the repo root
npm install
cp apps/mobile/.env.example apps/mobile/.env    # API URL
npm run dev:mobile                              # then press i (iOS simulator) / a (Android) or scan the QR code
```

To use a local API, run `npm run dev` at the repo root and set
`EXPO_PUBLIC_API_URL=http://<your computer's LAN IP>:8888/api` in `apps/mobile/.env`.

Expo Go can run everything except push notifications, which need a development or store build (below).

## Push notifications

The server sends a push through Expo's push service whenever a TradingView alert hits the user's webhook.

1. `npm install -g eas-cli` and `eas login`
2. In `apps/mobile`: `eas init` — this writes your project ID into `app.json` (`extra.eas.projectId`), which the app needs to get a push token.
3. **iOS:** `eas credentials` (or the first `eas build -p ios`) sets up the APNs key with your Apple Developer account.
4. **Android:** create a Firebase project, add an Android app with package `com.growmoneybot.app`, and upload its FCM V1 service-account key with `eas credentials`.
5. Optional: create an access token at expo.dev with "enhanced push security" on, and set `EXPO_ACCESS_TOKEN` in Netlify.

## Build and ship

```bash
cd apps/mobile
eas build --profile development --platform all   # dev client for testing push on a real phone
eas build --profile production --platform all    # store builds (EXPO_PUBLIC_API_URL from eas.json)
eas submit --platform ios                        # App Store Connect
eas submit --platform android                    # Google Play Console
```

Store accounts needed: Apple Developer Program and a Google Play Console account.

**Store review notes:** trading-related apps get extra scrutiny. GrowMoneyBot doesn't place trades or hold
money, so describe it as an educational strategy-backtesting tool, keep the in-app disclaimers, and give
reviewers a demo login. Apple requires apps with account sign-up to offer **in-app account deletion**
(App Store Review Guideline 5.1.1(v)) — add that before submitting (see "Before the store" in the root README).

## Why Pine Lab is web-only

Pine Lab uses PineTS (AGPL-3.0). Shipping it inside an app-store binary raises licensing issues on top of
the hosted-service ones, and its ~730 KB engine is better suited to the web. The Account tab links to it.
