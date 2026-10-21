// "Describe a strategy": translate the user's words into rules. Claude (structured output)
// handles any wording when ANTHROPIC_API_KEY is set; the built-in parser is the fallback.
// Either way the result is validated by fromDescriptionJson, so the backtest and the Pine
// Script are generated from checked rules, never from model output directly.
import { DESCRIPTION_SCHEMA, DESCRIPTION_PROMPT, fromDescriptionJson, parseStrategyText } from "@gmb/core";

export const DESCRIBE_MODEL = () => process.env.DESCRIBE_MODEL || "claude-haiku-5-5";
const API_URL = "https://api.anthropic.com/v1/messages";

/** Ask Claude for the description JSON. Throws on any API or format problem. */
export async function askClaude(text, { apiKey, model = DESCRIBE_MODEL(), fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const res = await fetchImpl(API_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 4000,
      system: DESCRIPTION_PROMPT,
      messages: [{ role: "user", content: text }],
      output_config: { format: { type: "json_schema", schema: DESCRIPTION_SCHEMA } },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Claude API error ${res.status}: ${data?.error?.message || "no details"}`);
  if (data.stop_reason === "refusal") throw new Error("Claude declined to translate this text");
  if (data.stop_reason === "max_tokens") throw new Error("Claude's answer was cut off");
  const block = (data.content || []).find((b) => b.type === "text");
  if (!block) throw new Error("Claude returned no text");
  return JSON.parse(block.text);
}

/**
 * Translate a description. `base` (market, symbol, interval, risk) fills what the text leaves open.
 * Returns { strategy, assumptions, unsupported, understood, source: "claude" | "parser", note? }.
 */
export async function describeStrategy(text, { apiKey = process.env.ANTHROPIC_API_KEY, base = {}, fetchImpl } = {}) {
  let json = null;
  let source = "parser";
  let note;
  if (apiKey) {
    try {
      json = await askClaude(text, { apiKey, fetchImpl });
      source = "claude";
    } catch (err) {
      console.error("describe: falling back to the built-in parser:", err.message);
      note = "The AI translator wasn't available, so the built-in parser read your description. It understands common phrasings only.";
    }
  }
  if (!json) json = parseStrategyText(text);
  const r = fromDescriptionJson(json, base);
  r.strategy.description = `Described as: "${text.trim().slice(0, 900)}"`;
  return { ...r, source, ...(note && { note }) };
}
