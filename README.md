# GrowMoneyBot — strategy builder, backtester & TradingView bridge

**Web:** React (Vite), mobile-first · **Mobile:** Expo (iOS + Android) · **API:** Express on Netlify Functions · **DB:** MongoDB Atlas

Users sign up, build trading strategies from technical indicators, backtest them on crypto or US stock
history, export them as Pine Script v6 for TradingView, receive TradingView alerts through a personal
webhook — as push notifications on their phone — and run their own Pine scripts in the web Pine Lab.

```
growmoneybot/                      npm workspaces monorepo
├── packages/core/                 shared by web + mobile (pure JS: no DOM, no React, no Node APIs)
│   └── src/  indicators · catalog · evaluate · backtest · pine · api (client) · candles · chartData · csv · format
├── apps/web/                      React + Vite, mobile-first (deployed to Netlify)
│   └── src/  pages · components/app · engine/pineRunner.js (PineTS, web-only)
├── apps/mobile/                   Expo SDK 57 app (see apps/mobile/README.md)
│   ├── app/                       expo-router screens: (tabs)/index · alerts · account, strategy/[id], login, signup
│   └── src/                       api, auth (SecureStore), push, theme, components (WebView chart, rule editor…)
├── server/                        Express API: models, routes, push.js (Expo push), auth.js
├── netlify/functions/api.js
└── netlify.toml
```

## How the pieces fit

| Feature | Where it runs |
|---|---|
| Strategy builder + backtest | On the device (browser or phone). Only the metrics summary is saved. |
| Price data | `/api/market/candles` — crypto from Binance.US (no key), US stocks from Alpaca (free key) |
| Pine export | Generated on the device from the same rules the backtester uses |
| TradingView alerts | TradingView → `POST /api/webhooks/tv/<user token>` → stored → Expo push to the user's phones |
| Pine Lab | Web only — PineTS runs the user's Pine Script in the browser |

### Mobile-first web
Styles start at phone width and add layout with `min-width` breakpoints (600 / 900 / 1100px). On phones the
app has a bottom tab bar, a sticky Save / Run backtest bar, one editor view at a time (Rules · Results · Pine ·
Alerts), card-style trade and alert lists, 44px touch targets and 16px inputs (no iOS zoom). From 1100px the
builder and results sit side by side. The site is also installable as a PWA (manifest + icons).

### Backtest rules (match TradingView's strategy tester defaults)
- Rules are checked on each bar's close; orders fill at the **next bar's open**.
- Position size = equity × % ÷ signal-bar close (Pine's `percent_of_equity`). An entry is skipped if the fill would cost more than available equity.
- Stop loss / take profit are active from the bar after the fill. If both are hit in one bar, the intrabar order follows TradingView's rule (whichever extreme is closer to the open comes first). Gaps fill at the open.
- Commission is % of traded value, charged on entry and exit. Net profit counts closed trades only; open P&L is shown separately.
- **Not simulated:** margin calls (TradingView partially closes large shorts), slippage, funding/borrow costs.

The indicators and the backtester were checked against PineTS on generated data: indicator values match to
~10 decimal places, and trade entry/exit bars and prices match for long and short strategies with
stop loss and take profit.

## API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/auth/signup` · `/api/auth/login` | — | `{ name?, email, password }` → `{ token, user }` |
| GET | `/api/auth/me` | ✓ | Current user (includes webhook token) |
| POST | `/api/auth/webhook-token` | ✓ | Issue a new webhook URL |
| GET/POST | `/api/strategies` | ✓ | List / create |
| GET/PUT/DELETE | `/api/strategies/:id` | ✓ | Read / update / delete |
| POST | `/api/strategies/:id/backtest` | ✓ | Save latest backtest metrics |
| GET/POST, PUT/DELETE | `/api/pine`, `/api/pine/:id` | ✓ | Saved Pine Lab scripts |
| PUT | `/api/auth/settings` | ✓ | `{ notifyOnSignals }` push on/off |
| DELETE | `/api/auth/account` | ✓ | `{ password }` — deletes the account and all its data |
| POST / DELETE | `/api/devices` | ✓ | Register / remove a phone's Expo push token |
| GET | `/api/market/candles?market=crypto\|stocks&symbol=&interval=15m\|1h\|4h\|1d\|1w&bars=50-5000` | ✓ | OHLCV candles |
| POST | `/api/webhooks/tv/:token` | token in URL | TradingView alert receiver (JSON or text) → push notification |
| GET/DELETE | `/api/signals` | ✓ | Received alerts (kept 90 days) |
| GET | `/api/marketplace?sort=followers\|live\|verified\|new&market=&q=` | optional | Published algorithms (results only, never rules) |
| GET | `/api/marketplace/:id` | optional | Algorithm page; rules included for followers, the author and admins |
| POST | `/api/marketplace` | approved expert | `{ strategyId, summary, description?, tags? }` → server re-runs and publishes |
| PUT · POST | `/api/marketplace/:id` · `/:id/republish` | author | Edit listing / list-unlist · publish a new version |
| POST/DELETE | `/api/marketplace/:id/follow` | ✓ | Follow / unfollow |
| POST · GET | `/api/marketplace/:id/copy` · `/:id/dataset` | follower | Copy rules into my strategies · frozen dataset for re-checking |
| GET · POST · PUT | `/api/experts/me` · `/apply` · `/me` | ✓ | Expert program status, application, profile |
| GET | `/api/experts/:id` | — | Public expert profile + published algorithms |
| GET/POST | `/api/admin/experts…` · `/api/admin/algorithms…` | admin | Approve / reject / revoke experts; remove / restore algorithms |

## Expert marketplace

Approved expert traders publish algorithms; anyone can browse the results, and followers unlock the rules.

- **Experts are approved by hand.** Traders apply from *Account → Expert program*. Admins (emails in `ADMIN_EMAILS`) review applications at `/app/admin`.
- **Results are verified, not uploaded.** On publish the server fetches the price history itself (completed bars only), runs the shared backtest engine, and stores the frozen rules, the exact dataset and a receipt: SHA-256 fingerprints of the rules (`specHash`), the data (`dataHash`) and `{ engine, specHash, dataHash, metrics }` (`receiptHash`). CSV data can't be published, and a backtest needs at least 10 closed trades.
- **Live track record.** From the publish date, only trades the rules enter after publishing count (indicators warm up on earlier bars). It refreshes when the page is viewed and hourly via the scheduled function `netlify/functions/refresh-live.mjs`.
- **New versions don't erase history.** Publishing changed rules creates a new version, restarts live tracking, and keeps the old version's verified and live results in the algorithm's history.
- **Fair rankings.** Every algorithm also gets a risk profile: annual volatility, a 1–5 risk rating (the worse of a volatility band and a drawdown band), and its return scaled to 10% volatility (Sharpe × 10), so leverage can't buy a top spot. The default sort uses `rankScore`: the live risk-adjusted return once there are 30+ live bars and 3+ live trades, otherwise the backtest's at half weight. These stats are derived from the equity curve and are deliberately kept out of the receipt, so they can change without breaking re-checks.
- **Fact sheets.** `/marketplace/:id/factsheet` is a printable one-pager: growth of 100 vs. holding the symbol and the market (Bitcoin for crypto, SPY for stocks), monthly returns, key facts and the receipt, plus a 1200×630 share image drawn in the browser.
- **Anyone following can re-check.** The algorithm page downloads the frozen dataset and re-runs `verifyBacktest` from `@gmb/core` in the browser, then compares all fingerprints and metrics.
- **Not in this version:** paid subscriptions and revenue sharing for experts, and live signal delivery for algorithms whose rules stay private.

## 1. Accounts you need

1. **MongoDB Atlas** (free M0): create a cluster, a database user, allow `0.0.0.0/0` under Network Access, copy the connection string.
2. **Alpaca** (free) for US stocks: sign up at https://alpaca.markets, open the paper-trading dashboard and generate API keys. The free plan uses the IEX feed (`ALPACA_FEED=iex`).
3. **TradingView**: webhook alerts need a paid plan with two-factor authentication on. Users bring their own account.

Crypto data needs no key.

For the mobile apps you'll also need an **Expo** account (free) for EAS builds and push, an **Apple Developer
Program** membership, a **Google Play Console** account, and a **Firebase** project for Android push.
Details in [apps/mobile/README.md](apps/mobile/README.md).

## 2. Run locally

```bash
cp .env.example .env     # fill in MONGODB_URI, JWT_SECRET, ALPACA keys
npm install              # installs every workspace (web, mobile, core, server)
npm install -g netlify-cli
npm run dev              # web + API at http://localhost:8888
npm run dev:mobile       # Expo dev server for the phone app (separate terminal)
```

## 3. Deploy to Netlify

1. Push to GitHub → Netlify **Add new site → Import an existing project**. Build settings come from `netlify.toml`.
2. **Site configuration → Environment variables**: `MONGODB_URI`, `JWT_SECRET` (48+ random bytes), `CORS_ORIGIN=https://growmoneybot.com`, `ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ALPACA_FEED=iex`, and optionally `EXPO_ACCESS_TOKEN` (push security).
   `netlify.toml` installs only the web app, core and server on Netlify, so the Expo app doesn't slow web deploys.
3. Deploy, then check `https://<site>.netlify.app/api/health`.
4. **Domain management → Add a domain** → `growmoneybot.com` (Netlify DNS, or `A @ 75.2.60.5` + `CNAME www <site>.netlify.app`).

## TradingView alert setup (what users do)
1. Copy the generated Pine Script → TradingView Pine Editor → **Add to chart**.
2. **Create alert** → condition: the strategy → message: `{{strategy.order.alert_message}}`.
3. **Notifications → Webhook URL**: the URL shown on the *Alerts* page (web) or *Alerts* tab (app).
4. In the mobile app, turn on **Account → Alert notifications** to get each alert as a push.

## ⚠️ Licensing: PineTS (Pine Lab)

Pine Lab uses [PineTS](https://github.com/LuxAlgo/PineTS), licensed **AGPL-3.0** (commercial licenses
available from LuxAlgo). Running AGPL code in a hosted product generally obliges you to publish your
source code to users. Before launching, either get legal advice and comply, buy a commercial license, or
remove the module:

- delete `apps/web/src/engine/pineRunner.js` and `apps/web/src/pages/PineLab.jsx`
- remove the `/app/pine` route in `apps/web/src/App.jsx` and its entry in `NAV` in `AppLayout.jsx`
- `npm uninstall pinets -w @gmb/web`

The mobile app doesn't include PineTS; its Account tab links to Pine Lab on the web.

Everything else (builder, backtester, Pine export, webhooks) is independent of PineTS.
Lightweight Charts is Apache-2.0 and shows TradingView attribution on the chart, which its license requires.

## Before going live
- Add rate limiting (e.g. on login and the webhook) — Netlify functions are stateless, so use a store such as Upstash Redis or Netlify's rate-limit config.
- Add password reset and email verification.
- Mobile: run `eas init`, set up APNs + FCM credentials, and test push on real phones with a development build.
- App Store / Play listing: describe GrowMoneyBot as an educational backtesting tool (it never places trades), keep the disclaimers, give reviewers a demo login. In-app account deletion is already included (Account tab).
- Have the disclaimer and terms reviewed; backtests are hypothetical and the product isn't investment advice.
