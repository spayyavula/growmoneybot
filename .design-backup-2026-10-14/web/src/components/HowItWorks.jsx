const steps = [
  { n: "01", title: "Build", text: "Pick a market and timeframe, then set entry and exit rules from technical indicators — or start from a template." },
  { n: "02", title: "Backtest", text: "See every trade on the chart, plus net profit, drawdown, win rate and an equity curve." },
  { n: "03", title: "Take it to TradingView", text: "Copy the generated Pine Script into TradingView and connect its alerts back to GrowMoneyBot." },
];

export default function HowItWorks() {
  return (
    <section className="section alt" id="how">
      <div className="container">
        <h2 className="section-title">How it works</h2>
        <div className="steps">
          {steps.map((s) => (
            <div key={s.n} className="step">
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
