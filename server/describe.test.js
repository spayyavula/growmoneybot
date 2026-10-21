// Describe a strategy: offline parser, validation of translated rules, and the Claude call.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStrategyText, fromDescriptionJson, DESCRIPTION_SCHEMA, DESCRIBE_EXAMPLES, operandLabel, generatePine, runBacktest,
} from "../packages/core/src/index.js";
import { askClaude, describeStrategy } from "./describe.js";

const read = (text, base) => fromDescriptionJson(parseStrategyText(text), base);
const say = (g) => g.conditions.map((c) => `${operandLabel(c.left)} ${c.op} ${operandLabel(c.right)}`);

test("the built-in parser reads every example", () => {
  const [btc, spy, eth, qqq] = DESCRIBE_EXAMPLES.map((t) => read(t));
  assert.deepEqual([btc.strategy.symbol, btc.strategy.interval, btc.strategy.risk.stopLossPct], ["BTCUSDT", "1h", 3]);
  assert.deepEqual(say(btc.strategy.entry), ["RSI(14) crossesAbove 30", "close > EMA(200)"]);
  assert.deepEqual(say(btc.strategy.exit), ["RSI(14) crossesAbove 70"]);

  assert.deepEqual([spy.strategy.market, spy.strategy.symbol, spy.strategy.interval], ["stocks", "SPY", "1d"]);
  assert.deepEqual(say(spy.strategy.exit), ["EMA(20) crossesBelow EMA(50)"]); // "when it crosses back below"
  assert.deepEqual([spy.strategy.risk.stopLossPct, spy.strategy.risk.takeProfitPct], [5, 10]);

  assert.deepEqual(say(eth.strategy.entry), ["close crossesAbove Bollinger Bands(20, 2) Upper"]);
  assert.deepEqual(say(eth.strategy.exit), ["close crossesBelow Bollinger Bands(20, 2) Basis"]);

  assert.deepEqual(say(qqq.strategy.entry), ["MACD(12, 26, 9) MACD line crossesAbove MACD(12, 26, 9) Signal line", "close > SMA(100)"]);
  for (const r of [btc, spy, eth, qqq]) assert.equal(r.understood, true);
});

test("parser: shorts, reused lengths, sizing, capital, and what it can't do", () => {
  const s = read("Short ETHUSDT on 15m when RSI(7) rises above 80, cover when RSI falls below 50. 2% stop");
  assert.deepEqual([s.strategy.direction, s.strategy.interval, s.strategy.exit.conditions[0].left.params.length], ["short", "15m", 7]);
  const b = read("Buy BTC when stochastic %K crosses above %D and %K is below 20. Exit when %K crosses below %D. Use $1,000 and 50% of my account. trailing stop 3%");
  assert.deepEqual([b.strategy.risk.initialCapital, b.strategy.risk.positionSizePct, b.strategy.risk.stopLossPct], [1000, 50, 3]);
  assert.match(b.unsupported.join(" "), /Trailing stops/);
  const n = read("buy tesla when elon tweets, sell after earnings");
  assert.equal(n.understood, false);
  assert.match(n.unsupported.join(" "), /News, earnings/);
  const a = read("buy AAPL when price closes above the 50 day moving average and sell when it drops below the 50 day moving average");
  assert.deepEqual([a.strategy.symbol, ...say(a.strategy.entry), ...say(a.strategy.exit)], ["AAPL", "close > SMA(50)", "close crossesBelow SMA(50)"]);
  assert.match(a.assumptions.join(" "), /Timeframe not mentioned/);
});

test("translated rules are validated: unknown indicators dropped, numbers clamped, symbols fixed", () => {
  const op = (type, params = [], field = "none") => ({ type, source: "close", field, params });
  const r = fromDescriptionJson({
    understood: true, name: "Test", market: "crypto", symbol: "sol", interval: "4h", direction: "long",
    entryLogic: "all", entry: [
      { left: op("rsi", [{ key: "length", value: 9999 }]), op: "crossesAbove", right: op("value", [{ key: "value", value: 30 }]) },
      { left: op("ichimoku"), op: ">", right: op("price") },
      { left: op("price"), op: "approximately", right: op("ema") },
    ],
    exitLogic: "any", exit: [], stopLossPct: -5, takeProfitPct: 0, positionSizePct: 0, initialCapital: 0, assumptions: [], unsupported: [],
  });
  assert.equal(r.strategy.symbol, "SOLUSDT");
  assert.equal(r.strategy.entry.conditions.length, 1);
  assert.equal(r.strategy.entry.conditions[0].left.params.length, 200); // clamped to the engine's max
  assert.equal(r.strategy.risk.stopLossPct, 0);
  assert.equal(r.strategy.risk.initialCapital, 500); // starter default
  assert.match(r.unsupported.join(" "), /Unknown indicator "ichimoku"/);
});

test("the open questions fall back to what the user already had", () => {
  const r = fromDescriptionJson(parseStrategyText("buy when RSI crosses above 30, sell when RSI crosses above 70"), { market: "stocks", symbol: "QQQ", interval: "1h" });
  assert.deepEqual([r.strategy.market, r.strategy.symbol, r.strategy.interval, r.strategy.risk.feePct], ["stocks", "QQQ", "1h", 0]);
});

test("the schema follows the structured-output rules", () => {
  const walk = (node, path = "schema") => {
    if (!node || typeof node !== "object") return;
    if (node.type === "object") assert.equal(node.additionalProperties, false, `${path} needs additionalProperties: false`);
    for (const banned of ["minimum", "maximum", "minLength", "maxLength", "maxItems", "multipleOf", "pattern"]) assert.ok(!(banned in node), `${path} uses ${banned}`);
    for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
  };
  walk(DESCRIPTION_SCHEMA);
});

const claudeReply = (json, extra = {}) => async (url, init) => ({
  ok: true, status: 200, url, init,
  json: async () => ({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(json) }], ...extra }),
});

test("askClaude sends a structured-output request and parses the JSON", async () => {
  const json = parseStrategyText(DESCRIBE_EXAMPLES[0]);
  let sent;
  const fetchImpl = async (url, init) => { sent = { url, init }; return claudeReply(json)(url, init); };
  const got = await askClaude("buy when…", { apiKey: "sk-test", fetchImpl });
  assert.deepEqual(got, json);
  assert.equal(sent.url, "https://api.anthropic.com/v1/messages");
  assert.equal(sent.init.headers["x-api-key"], "sk-test");
  assert.equal(sent.init.headers["anthropic-version"], "2023-06-01");
  const body = JSON.parse(sent.init.body);
  assert.equal(body.model, "claude-haiku-5-5");
  assert.equal(body.output_config.format.type, "json_schema");
  assert.deepEqual(body.output_config.format.schema, DESCRIPTION_SCHEMA);
  assert.equal(body.messages[0].content, "buy when…");
  await assert.rejects(askClaude("x", { apiKey: "k", fetchImpl: claudeReply({}, { stop_reason: "refusal" }) }), /declined/);
  await assert.rejects(askClaude("x", { apiKey: "k", fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) }) }), /401: bad key/);
});

test("describeStrategy uses Claude when it can, and the parser otherwise", async () => {
  const text = DESCRIBE_EXAMPLES[1];
  const viaClaude = await describeStrategy(text, { apiKey: "k", fetchImpl: claudeReply({ ...parseStrategyText(text), name: "From Claude" }) });
  assert.equal(viaClaude.source, "claude");
  assert.equal(viaClaude.strategy.name, "From Claude");
  assert.match(viaClaude.strategy.description, /^Described as: "Go long SPY/);

  const down = await describeStrategy(text, { apiKey: "k", fetchImpl: async () => { throw new Error("network down"); } });
  assert.equal(down.source, "parser");
  assert.match(down.note, /built-in parser/);
  assert.equal(down.strategy.symbol, "SPY");

  const noKey = await describeStrategy(text, { apiKey: "" });
  assert.equal(noKey.source, "parser");
  assert.equal(noKey.note, undefined);
});

test("a described strategy backtests and exports matching Pine Script", () => {
  const { strategy } = read(DESCRIBE_EXAMPLES[0]);
  const pine = generatePine(strategy);
  assert.match(pine, /ta\.rsi\(close, 14\)/);
  assert.match(pine, /ta\.ema\(close, 200\)/);
  // A rising market with sharp pullbacks: RSI dips under 30 while price stays above its 200-bar average
  const bars = Array.from({ length: 600 }, (_, i) => {
    const c = 100 + i * 0.4 - (i % 40 >= 30 ? (i % 40 - 29) * 2.5 : 0);
    return { time: 1.7e9 + i * 3600, open: c, high: c + 0.5, low: c - 0.5, close: c, volume: 1 };
  });
  assert.ok(runBacktest(bars, strategy).trades.length > 0);
});
