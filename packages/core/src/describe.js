// Describe a strategy in words → GrowMoneyBot rules.
//
// Two translators produce the same intermediate JSON (DESCRIPTION_SCHEMA):
//   • the server asks Claude for it (structured output), for any wording;
//   • parseStrategyText() handles common phrasings offline, as a fallback.
// fromDescriptionJson() then validates that JSON into a normal strategy, so the backtest and
// the Pine Script both come from the same checked rules.
import { OPERANDS, OPERATORS, INTERVALS, SOURCES, normalizeStrategy, STARTER_RISK } from "./catalog.js";
import { QUICK_SYMBOLS } from "./candles.js";

const OPERAND_TYPES = Object.keys(OPERANDS);
const OP_KEYS = OPERATORS.map((o) => o.key);
const FIELDS = ["none", "line", "signal", "hist", "upper", "middle", "lower", "k", "d"];
const PARAM_KEYS = ["length", "value", "fast", "slow", "signal", "mult", "kLength", "kSmooth", "dSmooth"];

const operandSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: OPERAND_TYPES },
    source: { type: "string", enum: SOURCES },
    field: { type: "string", enum: FIELDS },
    params: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string", enum: PARAM_KEYS }, value: { type: "number" } },
        required: ["key", "value"], additionalProperties: false,
      },
    },
  },
  required: ["type", "source", "field", "params"], additionalProperties: false,
};
const conditionSchema = {
  type: "object",
  properties: { left: { $ref: "#/$defs/operand" }, op: { type: "string", enum: OP_KEYS }, right: { $ref: "#/$defs/operand" } },
  required: ["left", "op", "right"], additionalProperties: false,
};

/** JSON schema for Claude's structured output (no numeric constraints: those are applied after). */
export const DESCRIPTION_SCHEMA = {
  type: "object",
  $defs: { operand: operandSchema, condition: conditionSchema },
  properties: {
    understood: { type: "boolean", description: "false if the text doesn't describe trading rules at all" },
    name: { type: "string" },
    market: { type: "string", enum: ["crypto", "stocks", "unspecified"] },
    symbol: { type: "string", description: "e.g. BTCUSDT, ETHUSDT, SPY, AAPL; empty if not mentioned" },
    interval: { type: "string", enum: [...INTERVALS.map((i) => i.key), "unspecified"] },
    direction: { type: "string", enum: ["long", "short"] },
    entryLogic: { type: "string", enum: ["all", "any"] },
    entry: { type: "array", items: { $ref: "#/$defs/condition" } },
    exitLogic: { type: "string", enum: ["all", "any"] },
    exit: { type: "array", items: { $ref: "#/$defs/condition" } },
    stopLossPct: { type: "number", description: "0 if not mentioned" },
    takeProfitPct: { type: "number", description: "0 if not mentioned" },
    positionSizePct: { type: "number", description: "0 if not mentioned" },
    initialCapital: { type: "number", description: "0 if not mentioned" },
    assumptions: { type: "array", items: { type: "string" }, description: "Choices you made that the text didn't specify, in plain words" },
    unsupported: { type: "array", items: { type: "string" }, description: "Parts of the text these rules can't express" },
  },
  required: ["understood", "name", "market", "symbol", "interval", "direction", "entryLogic", "entry", "exitLogic", "exit",
    "stopLossPct", "takeProfitPct", "positionSizePct", "initialCapital", "assumptions", "unsupported"],
  additionalProperties: false,
};

/** Instructions for Claude: what the rule engine can express. */
export const DESCRIPTION_PROMPT = `You translate a trader's plain-English strategy into rules for the GrowMoneyBot backtester. Reply only with JSON matching the schema.

What the engine can do:
- One market and symbol, one timeframe: ${INTERVALS.map((i) => i.key).join(", ")}. Crypto symbols are Binance pairs like BTCUSDT; stocks are US tickers like SPY.
- Direction "long" (buy, then sell) or "short" (sell short, then cover). One position at a time.
- Entry and exit are lists of conditions combined with "all" (AND) or "any" (OR). Conditions are checked at each bar's close; orders fill at the next bar's open. An empty exit list means exit only by stop loss / take profit.
- A condition compares two operands with: crossesAbove, crossesBelow, >, <, >=, <=.
- Operands (set every field; use source "close" and field "none" when they don't apply; put numbers in params):
  price (source), value (params: value), sma / ema (length), rsi (length), atr (length),
  macd (fast, slow, signal; field line|signal|hist), bb = Bollinger Bands (length, mult; field upper|middle|lower),
  stoch (kLength, kSmooth, dSmooth; field k|d), volume.
- Risk: stop loss % and take profit % from the entry price, position size % of equity, starting capital.

Rules:
- "rises above / goes above / breaks above / crosses over" → crossesAbove; "falls below / drops below / breaks below" → crossesBelow; "is above / while above / stays above" → ">" (and "<" for below).
- "moving average" without a type → sma. "200-day average" on a daily chart → sma length 200.
- Use standard defaults when a length isn't given (RSI 14, MACD 12/26/9, Bollinger 20/2, Stochastic 14/3/3) and say so in assumptions.
- Never invent indicators the engine lacks. Put anything you can't express (news, fundamentals, multiple timeframes, trailing stops, scaling in, specific times of day, other symbols) in "unsupported", and translate the rest.
- Use 0 for risk numbers that aren't mentioned and "unspecified" for market/interval that aren't mentioned.
- name: a short descriptive name (max 6 words).
- If the text isn't about trading rules, set understood=false with empty lists.`;

// ---- JSON → strategy -------------------------------------------------------------

function toOperand(o, problems) {
  if (!o || !OPERANDS[o.type]) { problems.push(`Unknown indicator "${o?.type}"`); return null; }
  const def = OPERANDS[o.type];
  const params = {};
  for (const p of def.params) {
    if (p.type === "source") params.source = SOURCES.includes(o.source) ? o.source : p.default;
    else {
      const given = (o.params || []).find((x) => x.key === p.key);
      params[p.key] = given && Number.isFinite(given.value) ? given.value : p.default;
    }
  }
  const out = { type: o.type, params };
  if (def.fields) out.field = def.fields.some((f) => f.key === o.field) ? o.field : def.fields[0].key;
  return out;
}

/**
 * Turn the intermediate JSON into a normalized strategy.
 * `base` supplies anything the description leaves open (market, symbol, timeframe, costs).
 * Returns { strategy, assumptions, unsupported, understood }.
 */
export function fromDescriptionJson(json, base = {}) {
  const problems = [];
  const group = (logic, list) => ({
    logic: logic === "any" ? "any" : "all",
    conditions: (Array.isArray(list) ? list : []).map((c) => {
      const left = toOperand(c?.left, problems), right = toOperand(c?.right, problems);
      if (!left || !right || !OP_KEYS.includes(c?.op)) return null;
      return { left, op: c.op, right };
    }).filter(Boolean),
  });
  const market = ["crypto", "stocks"].includes(json?.market) ? json.market : base.market || "crypto";
  let symbol = String(json?.symbol || "").toUpperCase().replace(/[^A-Z0-9.\-]/g, "").slice(0, 20);
  if (!symbol) symbol = base.market === market && base.symbol ? base.symbol : market === "stocks" ? "SPY" : "BTCUSDT";
  if (market === "crypto" && /^[A-Z]{2,6}$/.test(symbol) && !symbol.endsWith("USDT")) symbol += "USDT";
  const interval = INTERVALS.some((i) => i.key === json?.interval) ? json.interval : base.interval || "1d";
  const pos = (v) => (Number.isFinite(v) && v > 0 ? v : undefined);
  const baseRisk = { ...STARTER_RISK, ...(market === "stocks" && { feePct: 0 }), ...base.risk };

  const strategy = normalizeStrategy({
    name: String(json?.name || "Described strategy").slice(0, 80),
    description: "",
    market, symbol, interval, bars: base.bars || (interval === "1w" ? 400 : interval === "1d" ? 1000 : 2000),
    direction: json?.direction === "short" ? "short" : "long",
    entry: group(json?.entryLogic, json?.entry),
    exit: group(json?.exitLogic, json?.exit),
    risk: {
      ...baseRisk,
      initialCapital: pos(json?.initialCapital) ?? baseRisk.initialCapital,
      positionSizePct: pos(json?.positionSizePct) ?? baseRisk.positionSizePct,
      stopLossPct: Number.isFinite(json?.stopLossPct) && json.stopLossPct >= 0 ? json.stopLossPct : 0,
      takeProfitPct: Number.isFinite(json?.takeProfitPct) && json.takeProfitPct >= 0 ? json.takeProfitPct : 0,
    },
  });
  const unsupported = [...(Array.isArray(json?.unsupported) ? json.unsupported : []), ...problems].map(String).slice(0, 10);
  const assumptions = (Array.isArray(json?.assumptions) ? json.assumptions : []).map(String).slice(0, 10);
  if (json?.market === "unspecified" || !json?.market) assumptions.push(`Market not mentioned: using ${market === "stocks" ? "US stocks" : "crypto"} (${symbol}).`);
  if (json?.interval === "unspecified" || !json?.interval) assumptions.push(`Timeframe not mentioned: using ${INTERVALS.find((i) => i.key === interval).label} candles.`);
  return { strategy, assumptions, unsupported, understood: json?.understood !== false && strategy.entry.conditions.length > 0 };
}

// ---- Offline parser ------------------------------------------------------------------

const CRYPTO_NAMES = { bitcoin: "BTC", btc: "BTC", ethereum: "ETH", eth: "ETH", ether: "ETH", solana: "SOL", sol: "SOL", xrp: "XRP", ripple: "XRP", dogecoin: "DOGE", doge: "DOGE" };
const NOT_TICKERS = new Set(["RSI", "EMA", "SMA", "MA", "MACD", "ATR", "BB", "AND", "OR", "THE", "WHEN", "IF", "BUY", "SELL", "USD", "I", "A", "K", "D", "TP", "SL", "OK"]);

const num = (s) => Number(String(s).replace(/,/g, ""));
const P = (type, extra = {}) => ({ type, source: "close", field: "none", params: [], ...extra });
const withParams = (o, params) => ({ ...o, params: Object.entries(params).map(([key, value]) => ({ key, value })) });

/** Read one operand phrase ("the 50 EMA", "RSI(14)", "upper Bollinger band", "30", "price"). */
function readOperand(raw, ctx) {
  const t = raw.toLowerCase().replace(/\b(the|its|a|an|current)\b/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  let m;
  if ((m = t.match(/^-?\$?(\d[\d,]*(?:\.\d+)?)%?$/))) return withParams(P("value"), { value: num(m[1]) * (t.startsWith("-") ? -1 : 1) });
  if (/^(zero|0)( line)?$/.test(t)) return withParams(P("value"), { value: 0 });
  if (/\b(rsi|relative strength)\b/.test(t)) {
    const len = t.match(/(\d+)/);
    if (len) ctx.rsiLength = num(len[1]); // a later bare "RSI" means the same one
    return withParams(P("rsi"), { length: len ? num(len[1]) : ctx.rsiLength || 14 });
  }
  if (/\bmacd\b/.test(t) || /^signal( line)?$/.test(t) || /^histogram$/.test(t)) {
    const field = /signal/.test(t) ? "signal" : /hist/.test(t) ? "hist" : "line";
    const n = (t.match(/\d+/g) || []).map(Number);
    return withParams({ ...P("macd"), field }, n.length >= 3 ? { fast: n[0], slow: n[1], signal: n[2] } : { fast: 12, slow: 26, signal: 9 });
  }
  if (/\b(bollinger|band|bb)\b/.test(t)) {
    const field = /upper|top/.test(t) ? "upper" : /lower|bottom/.test(t) ? "lower" : "middle";
    const len = t.match(/(\d+)/);
    return withParams({ ...P("bb"), field }, { length: len ? num(len[1]) : 20, mult: 2 });
  }
  if (/\bstoch/.test(t) || /%\s?[kd]\b/.test(t)) {
    return withParams({ ...P("stoch"), field: /%\s?d\b|\bd line/.test(t) ? "d" : "k" }, { kLength: 14, kSmooth: 3, dSmooth: 3 });
  }
  if (/\batr\b|average true range/.test(t)) {
    const len = t.match(/(\d+)/);
    return withParams(P("atr"), { length: len ? num(len[1]) : 14 });
  }
  if (/\bvolume\b/.test(t)) return P("volume");
  if ((m = t.match(/(\d+)[- ]?(?:day|period|bar|hour|week)?[- ]?(ema|sma|ma|exponential moving average|simple moving average|moving average|average)\b/)) ||
      (m = t.match(/\b(ema|sma|ma|moving average)\s*\(?\s*(\d+)\)?/))) {
    const [len, kind] = /^\d/.test(m[1]) ? [num(m[1]), m[2]] : [num(m[2]), m[1]];
    return withParams(P(/ema|exponential/.test(kind) ? "ema" : "sma"), { length: len });
  }
  if (/\b(price|close|closing price|it|stock|coin|btc|bitcoin|eth|spy)\b/.test(t) || t === "") return P("price");
  ctx.unknown.push(raw.trim());
  return null;
}

const OP_PATTERNS = [
  [/\b(?:crosses|crossed|cross|moves|goes|rises|rose|climbs|breaks|broke|pops|jumps|gets|turns)\s+(?:back\s+)?(?:above|over|up\s+(?:through|over|above))\b/, "crossesAbove"],
  [/\b(?:crosses|crossed|cross|moves|goes|falls|fell|drops|dropped|dips|breaks|broke|sinks|turns)\s+(?:back\s+)?(?:below|under|down\s+(?:through|under|below))\b/, "crossesBelow"],
  [/\b(?:is|stays|remains|trades|closes|closed|while)?\s*(?:greater than or equal to|at or above|>=)\s*/, ">="],
  [/\b(?:is|stays|remains|trades|closes|closed|while)?\s*(?:less than or equal to|at or below|<=)\s*/, "<="],
  [/\b(?:is|stays|remains|trades|closes|closed)?\s*(?:above|over|greater than|higher than|>)\s*/, ">"],
  [/\b(?:is|stays|remains|trades|closes|closed)?\s*(?:below|under|less than|lower than|<)\s*/, "<"],
];

const OPPOSITE = { crossesAbove: "crossesBelow", crossesBelow: "crossesAbove", ">": "<", "<": ">", ">=": "<=", "<=": ">=" };

function readCondition(text, ctx, lastSubject) {
  for (const [re, op] of OP_PATTERNS) {
    const m = text.match(re);
    if (!m) continue;
    let leftText = text.slice(0, m.index).trim();
    const rightText = text.slice(m.index + m[0].length).trim();
    // "sell when it crosses back below": the reverse of the entry's first comparison
    if (!rightText && ctx.entryFirst && (!leftText || /^(it|they|that|this|the lines?|the averages?)$/.test(leftText))) {
      const e = ctx.entryFirst;
      return { cond: { left: e.left, op: OPPOSITE[op] === e.op ? op : OPPOSITE[e.op], right: e.right }, subject: null };
    }
    if (!leftText && lastSubject) leftText = lastSubject; // "...and above 70" reuses the previous subject
    const left = readOperand(leftText || "price", ctx);
    const right = readOperand(rightText, ctx);
    if (left && right) return { cond: { left, op, right }, subject: leftText || "price" };
    return null;
  }
  return null;
}

function readGroup(text, ctx) {
  const anyLogic = /\bor\b/.test(text) && !/\band\b/.test(text);
  const parts = text.split(/\s*(?:,\s*)?\b(?:and|or|&)\b\s*/).map((s) => s.trim()).filter(Boolean);
  const conditions = [];
  let subject = null;
  for (const part of parts) {
    const r = readCondition(part, ctx, subject);
    if (r) { conditions.push(r.cond); subject = r.subject; } else if (!/^(then|also)$/.test(part)) ctx.skipped.push(part);
  }
  return { logic: anyLogic ? "any" : "all", conditions };
}

/**
 * Offline translator for common phrasings. Returns the same JSON shape as Claude's.
 * e.g. "Buy BTC on the 1h chart when RSI crosses above 30 and price is above the 200 EMA.
 *       Sell when RSI goes above 70. 5% stop loss, 10% take profit."
 */
export function parseStrategyText(input) {
  const raw = String(input || "").slice(0, 1500);
  const text = raw.toLowerCase().replace(/[“”]/g, '"').replace(/\s+/g, " ");
  const ctx = { unknown: [], skipped: [] };
  const assumptions = [];
  const unsupported = [];

  // Market and symbol
  let market = "unspecified", symbol = "";
  const cryptoWord = Object.keys(CRYPTO_NAMES).find((w) => new RegExp(`\\b${w}\\b`).test(text));
  const pair = raw.match(/\b([A-Z]{2,6})(?:USDT|\/USDT?|-USD)\b/);
  if (pair) { market = "crypto"; symbol = `${pair[1]}USDT`; }
  else if (cryptoWord) { market = "crypto"; symbol = `${CRYPTO_NAMES[cryptoWord]}USDT`; }
  else {
    const known = QUICK_SYMBOLS.stocks.find((s) => new RegExp(`\\b${s}\\b`, "i").test(raw));
    const ticker = known || (raw.match(/\$?\b([A-Z]{1,5})\b/g) || []).map((x) => x.replace("$", "")).find((x) => !NOT_TICKERS.has(x));
    if (ticker) { market = "stocks"; symbol = ticker.toUpperCase(); }
    else if (/\b(stock|stocks|shares|etf|s&p|nasdaq)\b/.test(text)) market = "stocks";
    else if (/\b(crypto|coin|token)\b/.test(text)) market = "crypto";
  }

  // Timeframe
  let interval = "unspecified";
  if (/\b(15[- ]?m(?:in(?:ute)?s?)?|15-minute|fifteen[- ]minute)\b/.test(text)) interval = "15m";
  else if (/\b(4[- ]?h(?:ou)?r?s?|4-hour|four[- ]hour)\b/.test(text)) interval = "4h";
  else if (/\b(1[- ]?h(?:ou)?r?|hourly|one[- ]hour|60[- ]?min(?:ute)?s?)\b/.test(text)) interval = "1h";
  else if (/\b(weekly|1[- ]?w(?:eek)?\b|weekly chart)/.test(text)) interval = "1w";
  else if (/\b(daily|1[- ]?d\b|day chart|daily chart|each day|every day)\b/.test(text)) interval = "1d";

  // Risk numbers
  const pct = (re) => { const m = text.match(re); return m ? num(m[1]) : 0; };
  const stopLossPct = pct(/(\d+(?:\.\d+)?)\s*%\s*(?:stop(?:[- ]loss)?|sl)\b/) || pct(/\bstop(?:[- ]loss)?\s*(?:of|at|:)?\s*(\d+(?:\.\d+)?)\s*%/);
  const takeProfitPct = pct(/(\d+(?:\.\d+)?)\s*%\s*(?:take[- ]profit|profit target|target|tp)\b/) || pct(/\b(?:take[- ]profit|profit target|target|tp)\s*(?:of|at|:)?\s*\+?(\d+(?:\.\d+)?)\s*%/);
  const positionSizePct = pct(/(\d+(?:\.\d+)?)\s*%\s*of\s*(?:my\s*)?(?:account|equity|capital|portfolio|balance)/);
  const cap = text.match(/\$\s?(\d[\d,]*(?:\.\d+)?)\s*(k)?\b/);
  const initialCapital = cap ? num(cap[1]) * (cap[2] ? 1000 : 1) : 0;
  if (/trailing/.test(text)) unsupported.push("Trailing stops (a fixed stop loss % is used instead)");
  if (/\b(news|earnings|fundamental|p\/e|sentiment)\b/.test(text)) unsupported.push("News, earnings or fundamentals");
  if (/\b(scale in|scaling in|add to (the )?position|pyramid|average down|dca)\b/.test(text)) unsupported.push("Adding to a position (one position at a time)");

  // Entry and exit clauses
  const direction = /\b(short|go short|sell short)\b/.test(text) && !/\b(buy|go long|long)\b/.test(text) ? "short" : "long";
  const sentences = text.split(/(?<=[.;!?\n])\s+|\.\s*$/).map((s) => s.trim()).filter(Boolean);
  const entryRe = direction === "short"
    ? /\b(?:short|go short|sell short|enter)\b[^.;]*?\b(?:when|if|once|after|whenever)\b\s*(.+)/
    : /\b(?:buy|go long|long|enter|get in|open)\b[^.;]*?\b(?:when|if|once|after|whenever)\b\s*(.+)/;
  const exitRe = direction === "short"
    ? /\b(?:cover|exit|close|buy back|get out)\b[^.;]*?\b(?:when|if|once|after|whenever)\b\s*(.+)/
    : /\b(?:sell|exit|close|get out|take profits?)\b[^.;]*?\b(?:when|if|once|after|whenever)\b\s*(.+)/;
  let entry = { logic: "all", conditions: [] }, exit = { logic: "any", conditions: [] };
  for (const s of sentences) {
    // Split "buy when X and sell when Y" into its entry and exit clauses
    const clauses = s.split(/[,;]?\s*\b(?:and\s+|then\s+)?(?=\b(?:buy|sell|exit|close|cover|short|go long|go short|get out|get in|enter|take profits?)\b[^.;]*?\b(?:when|if|once|whenever|after)\b)/);
    for (const c of clauses) {
      const clean = c.replace(/\b(?:on|using|with)\s+(?:the\s+)?(?:\d+[- ]?(?:m|min|h|hour|d|day|w|week)s?|hourly|daily|weekly|4-hour|15-minute)\s*(?:chart|candles|timeframe|bars)?\b/g, " ").trim();
      let m;
      if ((m = clean.match(exitRe)) && !(direction === "long" && /\bsell short\b/.test(clean))) {
        const g = readGroup(m[1].replace(/[.!]+$/, ""), ctx);
        if (g.conditions.length) exit = { logic: g.conditions.length > 1 ? g.logic : "any", conditions: [...exit.conditions, ...g.conditions] };
      } else if ((m = clean.match(entryRe))) {
        const g = readGroup(m[1].replace(/[.!]+$/, ""), ctx);
        if (g.conditions.length) entry = { logic: g.logic, conditions: [...entry.conditions, ...g.conditions] };
        ctx.entryFirst = ctx.entryFirst || entry.conditions[0];
      }
    }
  }

  // Defaults the text left open
  if (entry.conditions.some((c) => c.left.type === "rsi" || c.right.type === "rsi") && !/rsi\s*\(?\s*\d/.test(text)) assumptions.push("RSI uses the standard 14 periods.");
  if (/\bmacd\b/.test(text) && !/macd\s*\(?\s*\d/.test(text)) assumptions.push("MACD uses the standard 12/26/9 settings.");
  if (/bollinger|band/.test(text)) assumptions.push("Bollinger Bands use 20 periods and 2 standard deviations.");
  if (!exit.conditions.length && !stopLossPct && !takeProfitPct && entry.conditions.length) assumptions.push("No exit was described, so trades only close when the backtest ends. Add a sell rule, a stop loss or a target.");
  for (const u of ctx.unknown) unsupported.push(`Couldn't read "${u}"`);
  for (const s of ctx.skipped) unsupported.push(`Couldn't turn "${s}" into a rule`);

  const words = [entry.conditions[0]?.left.type, entry.conditions[0]?.right.type].filter((x) => x && x !== "price" && x !== "value");
  const name = `${symbol || (market === "stocks" ? "Stock" : "Crypto")} ${words.length ? words[0].toUpperCase() : "rules"} ${direction === "short" ? "short" : "strategy"}`;
  return {
    understood: entry.conditions.length > 0, name, market, symbol, interval, direction,
    entryLogic: entry.logic, entry: entry.conditions, exitLogic: exit.logic, exit: exit.conditions,
    stopLossPct, takeProfitPct, positionSizePct, initialCapital, assumptions, unsupported: [...new Set(unsupported)],
  };
}

/** Example descriptions for the UI. */
export const DESCRIBE_EXAMPLES = [
  "Buy Bitcoin on the 1h chart when RSI crosses above 30 and price is above the 200 EMA. Sell when RSI goes above 70. 3% stop loss.",
  "Go long SPY on the daily chart when the 20 EMA crosses above the 50 EMA. Sell when it crosses back below. 5% stop, 10% take profit.",
  "Buy ETH on the 4h chart when price breaks above the upper Bollinger band. Exit when price falls below the middle band.",
  "Buy QQQ daily when the MACD line crosses above the signal line and price is above the 100 SMA. Sell when MACD crosses below the signal line.",
];
