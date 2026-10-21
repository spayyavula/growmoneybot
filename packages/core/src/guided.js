// Guided builder: turns a beginner's answers (market, style, pace, risk) into a complete
// strategy with rules, costs and sizing, plus plain-English explanations of each choice.
import { normalizeStrategy, SMALL_ACCOUNT_PRESETS } from "./catalog.js";
import { OPTION_DEFAULTS } from "./options.js";

const price = () => ({ type: "price", params: { source: "close" } });
const ema = (length) => ({ type: "ema", params: { source: "close", length } });
const sma = (length) => ({ type: "sma", params: { source: "close", length } });
const rsi = () => ({ type: "rsi", params: { source: "close", length: 14 } });
const value = (v) => ({ type: "value", params: { value: v } });
const bb = (field) => ({ type: "bb", params: { source: "close", length: 20, mult: 2 }, field });
const macd = (field) => ({ type: "macd", params: { source: "close", fast: 12, slow: 26, signal: 9 }, field });
const cond = (left, op, right) => ({ left, op, right });

export const GUIDED_PACES = [
  { key: "intraday", label: "A few times a day", interval: "1h", bars: 2000, unit: "hour", blurb: "Hourly candles. More trades, so fees and spreads matter more." },
  { key: "daily", label: "Once a day", interval: "1d", bars: 1000, unit: "day", blurb: "Daily candles. A good starting point: fewer, larger moves." },
  { key: "weekly", label: "Once a week", interval: "1w", bars: 400, unit: "week", blurb: "Weekly candles. Very few trades; positions last weeks or months." },
];

export const GUIDED_STYLES = [
  {
    key: "trend", label: "Follow the trend", short: "Trend follower",
    blurb: "Buy once a rise is underway and hold until it fades.",
    tradeoff: "Wins less often, but winners can run. Struggles when prices move sideways.",
  },
  {
    key: "dip", label: "Buy the dip", short: "Dip buyer",
    blurb: "Buy after a sharp pullback and sell on the bounce.",
    tradeoff: "Wins often with small gains. A real crash can keep falling, so the stop loss matters.",
  },
  {
    key: "breakout", label: "Catch breakouts", short: "Breakout trader",
    blurb: "Buy when price breaks above its recent range.",
    tradeoff: "Catches big moves early. Many breakouts fail and fall back.",
  },
  {
    key: "momentum", label: "Ride momentum", short: "Momentum rider",
    blurb: "Buy when an uptrend speeds up, sell when it slows.",
    tradeoff: "Fewer, cleaner signals, but it can get in late.",
  },
];

export const GUIDED_RISK = [
  { key: "careful", label: "Careful", blurb: "Half the account per trade, a tight stop and a profit target.", size: 50, stopMult: 0.7, target: true, optionsRisk: 15 },
  { key: "balanced", label: "Balanced", blurb: "Most of the account per trade and a standard stop.", size: 95, stopMult: 1, target: false, optionsRisk: 25 },
  { key: "bold", label: "Bold", blurb: "The whole account per trade and a wide stop. Bigger swings both ways.", size: 100, stopMult: 1.4, target: false, optionsRisk: 35 },
];

const BASE_STOP = { intraday: 3, daily: 7, weekly: 12 }; // % below entry, before the risk multiplier
const OPTION_DTE = { intraday: 14, daily: 30, weekly: 60 };
export const MARGIN_MINIMUM = 2000;
const TYPICAL_SPREAD_COST = 110; // a $2-wide, at-the-money debit spread with fees, per contract

// Each recipe: rules for a style at a pace, and what they mean in plain words
function recipe(style, pace, careful) {
  const unit = GUIDED_PACES.find((p) => p.key === pace).unit;
  const longAvg = pace === "weekly" ? 50 : 200;
  const filter = cond(price(), ">", sma(longAvg));
  const filterText = `and only while price is above its ${longAvg}-${unit} average, so it doesn't buy into a long decline`;
  switch (style) {
    case "trend": {
      const [f, s] = pace === "weekly" ? [10, 30] : [20, 50];
      return {
        entry: { logic: "all", conditions: [cond(ema(f), "crossesAbove", ema(s))] },
        exit: { logic: "any", conditions: [cond(ema(f), "crossesBelow", ema(s))] },
        entryText: `Buy when the ${f}-${unit} average price crosses above the ${s}-${unit} average: a sign a rise is underway.`,
        exitText: `Sell when the ${f}-${unit} average crosses back below the ${s}-${unit} average.`,
      };
    }
    case "dip":
      return {
        entry: { logic: "all", conditions: [cond(rsi(), "crossesAbove", value(30)), ...(careful ? [filter] : [])] },
        exit: { logic: "any", conditions: [cond(rsi(), "crossesAbove", value(65))] },
        entryText: `Buy when RSI, a 0–100 gauge of recent selling, climbs back above 30 after a sell-off${careful ? `, ${filterText}` : ""}.`,
        exitText: "Sell when RSI rises above 65, after the bounce.",
      };
    case "breakout":
      return {
        entry: { logic: "all", conditions: [cond(price(), "crossesAbove", bb("upper")), ...(careful ? [filter] : [])] },
        exit: { logic: "any", conditions: [cond(price(), "crossesBelow", bb("middle"))] },
        entryText: `Buy when the close breaks above the top of its usual 20-${unit} range (the upper Bollinger Band)${careful ? `, ${filterText}` : ""}.`,
        exitText: `Sell when the close falls back below the middle of that range (its 20-${unit} average).`,
      };
    case "momentum":
    default: {
      const trendLen = pace === "weekly" ? 30 : 50;
      return {
        entry: { logic: "all", conditions: [cond(macd("line"), "crossesAbove", macd("signal")), cond(price(), ">", ema(trendLen))] },
        exit: { logic: "any", conditions: [cond(macd("line"), "crossesBelow", macd("signal"))] },
        entryText: `Buy when MACD, a measure of whether a move is speeding up, turns up, while price is above its ${trendLen}-${unit} average.`,
        exitText: "Sell when MACD turns back down.",
      };
    }
  }
}

const roundHalf = (x) => Math.round(x * 2) / 2;

/**
 * Build a strategy from guided answers.
 *   answers: { market: "crypto"|"stocks", symbol, capital, account: "cash"|"margin",
 *              style, pace, risk, instrument: "shares"|"options" }
 * Returns { strategy (normalized), summary: [sentences], warnings: [sentences] }.
 */
export function buildGuidedStrategy(answers = {}) {
  const market = answers.market === "stocks" ? "stocks" : "crypto";
  const symbol = String(answers.symbol || (market === "stocks" ? "SPY" : "BTCUSDT")).toUpperCase();
  const capital = Math.max(10, Math.round(Number(answers.capital) || 500));
  const style = GUIDED_STYLES.find((s) => s.key === answers.style) || GUIDED_STYLES[0];
  const pace = GUIDED_PACES.find((p) => p.key === answers.pace) || GUIDED_PACES[1];
  const risk = GUIDED_RISK.find((r) => r.key === answers.risk) || GUIDED_RISK[1];
  const options = market === "stocks" && answers.instrument === "options";
  const account = market === "stocks" ? (capital < MARGIN_MINIMUM || answers.account === "cash" ? "cash" : "margin") : "margin";

  const r = recipe(style.key, pace.key, risk.key === "careful");
  const stopLossPct = roundHalf(BASE_STOP[pace.key] * risk.stopMult);
  const takeProfitPct = risk.target ? stopLossPct * 2 : 0;
  const costs = SMALL_ACCOUNT_PRESETS.find((p) => p.key === (market === "stocks" ? "stocks-cash" : "crypto-low")).risk;

  const strategy = normalizeStrategy({
    name: `${style.short} · ${symbol} ${pace.key === "intraday" ? "hourly" : pace.key}`,
    description: "",
    market, symbol, interval: pace.interval, bars: pace.bars, direction: "long", account,
    entry: r.entry, exit: r.exit,
    risk: {
      initialCapital: capital, positionSizePct: risk.size, feePct: costs.feePct, slippagePct: costs.slippagePct,
      stopLossPct: options ? 0 : stopLossPct, takeProfitPct: options ? 0 : takeProfitPct,
    },
    ...(options && {
      instrument: "options",
      options: { ...OPTION_DEFAULTS, structure: "spread", dte: OPTION_DTE[pace.key], riskPct: risk.optionsRisk, takeProfitPct: 50, stopLossPct: 50 },
    }),
  });

  const money = (n) => `$${Math.round(n).toLocaleString("en-US")}`;
  const summary = [r.entryText, r.exitText];
  if (options) {
    summary.push(
      `Each buy signal opens a $${OPTION_DEFAULTS.spreadWidth}-wide bull call spread expiring in about ${OPTION_DTE[pace.key]} days, using at most ${risk.optionsRisk}% of the account (${money((capital * risk.optionsRisk) / 100)} to start). That's also the most one trade can lose.`,
      "It closes at a 50% gain or a 50% loss on what you paid, on the sell signal, or at expiry.",
    );
  } else {
    summary.push(`Each trade uses ${risk.size}% of the account (${money((capital * risk.size) / 100)} to start).`);
    summary.push(
      `A stop loss sells if price falls ${stopLossPct}% below the entry${takeProfitPct ? `, and a profit target sells at +${takeProfitPct}%` : ""}.`,
    );
  }
  summary.push(
    market === "stocks"
      ? `Costs: commission-free with ${costs.slippagePct}% slippage per fill${options ? `, plus about $${OPTION_DEFAULTS.feePerContract} per option contract and the bid-ask spread` : ""}.`
      : `Costs: ${costs.feePct}% fees and ${costs.slippagePct}% slippage per fill, typical for a low-fee exchange.`,
  );
  strategy.description = `Made with the guided builder. ${summary.join(" ")}`.slice(0, 1000);

  const warnings = [];
  if (market === "stocks" && capital < MARGIN_MINIMUM && answers.account === "margin")
    warnings.push(`Margin accounts need at least ${money(MARGIN_MINIMUM)}, so this uses a cash account.`);
  if (market === "stocks" && account === "cash" && pace.key === "intraday" && !options)
    warnings.push("Hourly trading in a cash account can re-buy with money that hasn't settled yet. The results will flag any trades that would break the settlement rules.");
  if (options) {
    const needed = Math.ceil(TYPICAL_SPREAD_COST / (risk.optionsRisk / 100) / 50) * 50;
    if (capital < needed)
      warnings.push(`One $${OPTION_DEFAULTS.spreadWidth}-wide spread usually costs about ${money(TYPICAL_SPREAD_COST)}, more than ${risk.optionsRisk}% of ${money(capital)}, so most signals would be skipped. Pick a bolder risk level or start with about ${money(needed)}.`);
  }
  if (pace.key === "intraday")
    warnings.push("Trading every few hours means more trades, so costs take a bigger share. Check the cost check in the results.");
  if (pace.key === "weekly" && style.key === "dip")
    warnings.push("Weekly dips are rare, so expect only a handful of trades.");

  return { strategy, summary, warnings };
}
