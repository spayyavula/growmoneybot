import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  QUICK_SYMBOLS, GUIDED_STYLES, GUIDED_PACES, GUIDED_RISK, MARGIN_MINIMUM, buildGuidedStrategy,
  loadCandles, runBacktest, costCheck, fmt,
} from "@gmb/core";
import * as api from "../api.js";
import { EquityChart } from "../components/app/PriceChart.jsx";
import { RulesView } from "../components/market/parts.jsx";

const STEPS = ["Market", "Style", "Pace", "Risk", "Review"];
const AMOUNTS = [250, 500, 1000, 5000];
const VERDICT = {
  ok: "The average trade clears its costs.",
  thin: "Thin edge: costs take a big share of each trade.",
  negative: "After costs, the average trade lost money.",
  none: "Too few trades to judge costs.",
};

function Choice({ on, onClick, title, children, disabled, aside }) {
  return (
    <button type="button" role="radio" aria-checked={on} className={`choice ${on ? "on" : ""}`} onClick={onClick} disabled={disabled}>
      <span className="choice-head"><b>{title}</b>{aside && <span className="choice-aside">{aside}</span>}</span>
      {children}
    </button>
  );
}

export default function GuidedBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [a, setA] = useState({ market: "crypto", symbol: "BTCUSDT", capital: 500, account: "cash", style: null, pace: "daily", risk: "balanced", instrument: "shares" });
  const [name, setName] = useState("");
  const [test, setTest] = useState({ state: "idle" });
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState({ state: "idle", msg: "" });
  const set = (patch) => setA((prev) => ({ ...prev, ...patch }));

  const built = useMemo(() => buildGuidedStrategy({ ...a, style: a.style || "trend" }), [a]);
  const strategy = useMemo(() => ({ ...built.strategy, name: name.trim() || built.strategy.name }), [built, name]);
  const canNext = step === 0 ? Number(a.capital) >= 10 && a.symbol.length > 0 : step !== 1 || !!a.style;

  // Backtest the result when the review step opens or the answers change
  useEffect(() => {
    if (step !== 4) return undefined;
    let live = true;
    setTest({ state: "loading" });
    loadCandles(api.api, built.strategy)
      .then((candles) => {
        const result = runBacktest(candles, built.strategy);
        if (live) setTest({ state: "done", candles, result });
      })
      .catch((e) => live && setTest({ state: "error", msg: e.message }));
    return () => { live = false; };
  }, [step, built, retry]);

  const go = (n) => { setStep(n); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const save = async () => {
    setSaving({ state: "loading", msg: "Saving…" });
    try {
      const d = await api.createStrategy({ ...strategy, instrument: strategy.instrument || "shares" });
      if (test.state === "done") await api.saveBacktestSummary(d.strategy._id, test.result.metrics).catch(() => {});
      navigate(`/app/strategies/${d.strategy._id}`);
    } catch (e) {
      setSaving({ state: "error", msg: e.message });
    }
  };

  const riskPreview = (key) => buildGuidedStrategy({ ...a, style: a.style || "trend", risk: key }).strategy;

  return (
    <div className="guided">
      <Link to="/app" className="muted small">← Strategies</Link>
      <div className="guided-head">
        <h1>Build a strategy step by step</h1>
        <p className="muted">Answer five questions. You'll get a complete strategy, tested on past prices, that you can save and fine-tune.</p>
      </div>

      <ol className="guided-steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "current" : i < step ? "done" : ""}>
            {i < step ? <button type="button" className="link-btn" onClick={() => go(i)}>{label}</button> : <span aria-current={i === step ? "step" : undefined}>{label}</span>}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="panel guided-panel">
          <h2>What do you want to trade?</h2>
          <div className="choice-grid two" role="radiogroup" aria-label="Market">
            <Choice on={a.market === "crypto"} onClick={() => set({ market: "crypto", symbol: "BTCUSDT", instrument: "shares" })} title="Crypto">
              <span>Bitcoin, Ethereum and more. Trades around the clock, with bigger daily swings.</span>
            </Choice>
            <Choice on={a.market === "stocks"} onClick={() => set({ market: "stocks", symbol: "SPY" })} title="US stocks & ETFs">
              <span>Index funds like SPY and QQQ, or single companies. Trades on weekdays during market hours.</span>
            </Choice>
          </div>

          <h3>Which one?</h3>
          <div className="chips" role="radiogroup" aria-label="Symbol">
            {QUICK_SYMBOLS[a.market].map((sym) => (
              <button type="button" key={sym} role="radio" aria-checked={a.symbol === sym} className={`chip ${a.symbol === sym ? "on" : ""}`} onClick={() => set({ symbol: sym })}>{sym}</button>
            ))}
          </div>
          <label className="field guided-symbol">
            <span>Or type a symbol</span>
            <input id="guided-symbol" value={a.symbol} maxLength={20} onChange={(e) => set({ symbol: e.target.value.toUpperCase().replace(/[^A-Z0-9.\-]/g, "") })} />
          </label>
          {a.market === "stocks" && <p className="muted tiny">Index funds such as SPY and QQQ move more steadily than single stocks: a calmer place to start.</p>}

          <h3>How much will you start with?</h3>
          <div className="guided-capital">
            <label className="field"><span>Starting amount ($)</span>
              <input id="guided-capital" type="number" inputMode="decimal" min={10} value={a.capital} onChange={(e) => set({ capital: e.target.value === "" ? "" : Number(e.target.value) })} />
            </label>
            <div className="chips" aria-label="Quick amounts">
              {AMOUNTS.map((n) => <button type="button" key={n} className={`chip ${Number(a.capital) === n ? "on" : ""}`} onClick={() => set({ capital: n })}>{fmt.money(n)}</button>)}
            </div>
          </div>

          {a.market === "stocks" && (
            <>
              <h3>Which kind of brokerage account?</h3>
              <div className="choice-grid two" role="radiogroup" aria-label="Account type">
                <Choice on={a.account === "cash" || Number(a.capital) < MARGIN_MINIMUM} onClick={() => set({ account: "cash" })} title="Cash account">
                  <span>Any amount. Money from a sale is usable the next trading day.</span>
                </Choice>
                <Choice on={a.account === "margin" && Number(a.capital) >= MARGIN_MINIMUM} onClick={() => set({ account: "margin" })} title="Margin account" disabled={Number(a.capital) < MARGIN_MINIMUM} aside={`${fmt.money(MARGIN_MINIMUM)}+`}>
                  <span>Needs at least {fmt.money(MARGIN_MINIMUM)}. No waiting for sales to settle.</span>
                </Choice>
              </div>
            </>
          )}
        </section>
      )}

      {step === 1 && (
        <section className="panel guided-panel">
          <h2>What kind of trader do you want to be?</h2>
          <p className="muted small">Each style buys for a different reason. None wins in every market.</p>
          <div className="choice-grid" role="radiogroup" aria-label="Style">
            {GUIDED_STYLES.map((s) => (
              <Choice key={s.key} on={a.style === s.key} onClick={() => set({ style: s.key })} title={s.label}>
                <span>{s.blurb}</span>
                <span className="choice-note">{s.tradeoff}</span>
              </Choice>
            ))}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="panel guided-panel">
          <h2>How often will you check in?</h2>
          <p className="muted small">This sets the candle size the rules look at. Signals come at the close of each candle.</p>
          <div className="choice-grid three" role="radiogroup" aria-label="Pace">
            {GUIDED_PACES.map((p) => (
              <Choice key={p.key} on={a.pace === p.key} onClick={() => set({ pace: p.key })} title={p.label}>
                <span>{p.blurb}</span>
              </Choice>
            ))}
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="panel guided-panel">
          <h2>How much risk is comfortable?</h2>
          <div className="choice-grid three" role="radiogroup" aria-label="Risk">
            {GUIDED_RISK.map((r) => {
              const s = riskPreview(r.key);
              const opt = s.instrument === "options";
              return (
                <Choice key={r.key} on={a.risk === r.key} onClick={() => set({ risk: r.key })} title={r.label}>
                  <span>{r.blurb}</span>
                  <span className="choice-note">
                    {opt
                      ? `Up to ${s.options.riskPct}% of the account per trade (${fmt.money((Number(a.capital) * s.options.riskPct) / 100)})`
                      : `${s.risk.positionSizePct}% per trade · stop ${s.risk.stopLossPct}% below entry${s.risk.takeProfitPct ? ` · target +${s.risk.takeProfitPct}%` : ""}`}
                  </span>
                </Choice>
              );
            })}
          </div>

          {a.market === "stocks" && (
            <>
              <h3>Trade shares or options?</h3>
              <div className="choice-grid two" role="radiogroup" aria-label="Instrument">
                <Choice on={a.instrument !== "options"} onClick={() => set({ instrument: "shares" })} title="Shares">
                  <span>Buy and sell the stock itself. Simple, and losses grow only as fast as the price falls.</span>
                </Choice>
                <Choice on={a.instrument === "options"} onClick={() => set({ instrument: "options" })} title="Options spreads" aside="Advanced">
                  <span>Each signal buys a small call spread instead. You can lose all you paid for it, but never more.</span>
                </Choice>
              </div>
            </>
          )}
        </section>
      )}

      {step === 4 && (
        <section className="panel guided-panel">
          <h2>Your strategy</h2>
          <label className="field">
            <span>Name</span>
            <input id="guided-name" value={name || built.strategy.name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </label>

          <ul className="guided-summary">
            {built.summary.map((line) => <li key={line}>{line}</li>)}
          </ul>
          {built.warnings.map((w) => <p key={w} className="note warn tiny">{w}</p>)}

          <h3>How it did on past prices</h3>
          {test.state === "loading" && <p className="muted">Testing on {fmt.num(built.strategy.bars, 0)} candles of {built.strategy.symbol}…</p>}
          {test.state === "error" && (
            <p className="form-msg error">
              {test.msg} <button type="button" className="link-btn" onClick={() => setRetry((n) => n + 1)}>Try again</button>
            </p>
          )}
          {test.state === "done" && (() => {
            const m = test.result.metrics;
            const c = costCheck(m);
            const ret = m.netProfitPct;
            return (
              <>
                <p className="small run-meta muted">
                  {fmt.date(test.candles[0].time)} → {fmt.date(test.candles[test.candles.length - 1].time)} · starting with {fmt.money(built.strategy.risk.initialCapital)}
                  {test.result.options && " · option prices are estimates"}
                </p>
                <dl className="guided-results">
                  <div><dt>Result</dt><dd className={fmt.signClass(ret)}>{ret > 0 ? "+" : ""}{fmt.pct(ret, 1)}</dd><span>{fmt.money(m.netProfit)}</span></div>
                  <div><dt>Just holding {built.strategy.symbol}</dt><dd className={fmt.signClass(m.buyHoldPct)}>{m.buyHoldPct > 0 ? "+" : ""}{fmt.pct(m.buyHoldPct, 1)}</dd><span>same period</span></div>
                  <div><dt>Worst drop</dt><dd>{fmt.pct(m.maxDrawdownPct, 1)}</dd><span>from a high</span></div>
                  <div><dt>Trades</dt><dd>{fmt.num(m.totalTrades, 0)}</dd><span>{m.totalTrades ? `${fmt.pct(m.winRatePct, 0)} won` : "none"}</span></div>
                </dl>
                <p className={`cost-line small ${c.level === "negative" ? "neg" : c.level === "thin" ? "warn-text" : ""}`}>{VERDICT[c.level]}</p>
                <EquityChart equity={test.result.equity} />
                <p className="muted tiny">
                  Past results are hypothetical and don't predict the future. Use them to compare ideas, not to expect a return.
                  {ret < m.buyHoldPct ? ` Over this period, simply holding ${built.strategy.symbol} did better.` : ""}
                </p>
              </>
            );
          })()}

          <details className="guided-rules">
            <summary>See the exact rules</summary>
            <RulesView rules={strategy} />
          </details>

          {saving.msg && <p className={`form-msg ${saving.state}`} role="status">{saving.msg}</p>}
          <div className="guided-final">
            <button type="button" className="btn" onClick={save} disabled={saving.state === "loading"}>Save and open in the builder</button>
            <button type="button" className="btn btn-ghost" onClick={() => go(1)}>Change answers</button>
          </div>
          <p className="muted tiny">In the builder you can adjust every rule, run longer backtests and export to TradingView.</p>
        </section>
      )}

      {step < 4 && (
        <div className="guided-nav">
          <button type="button" className="btn btn-ghost" onClick={() => go(step - 1)} disabled={step === 0}>Back</button>
          <span className="muted small">Step {step + 1} of {STEPS.length}</span>
          <button type="button" className="btn" onClick={() => go(step + 1)} disabled={!canNext}>{step === 3 ? "See my strategy" : "Next"}</button>
        </div>
      )}
    </div>
  );
}
