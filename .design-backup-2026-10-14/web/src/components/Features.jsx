const features = [
  { icon: "🧩", title: "No-code strategy builder", text: "Combine SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic and price into entry and exit rules." },
  { icon: "⏪", title: "Realistic backtests", text: "Orders fill at the next bar's open, with fees, stop losses and take profits, the same way TradingView's strategy tester works." },
  { icon: "🌲", title: "One-click Pine Script", text: "Every strategy becomes a Pine Script v6 strategy you can paste straight into TradingView." },
  { icon: "🔔", title: "TradingView alerts", text: "Point your TradingView alerts at your personal webhook and see every signal in one place." },
  { icon: "🧪", title: "Pine Lab", text: "Already have Pine scripts? Paste them in and run them on crypto or stock charts right here." },
  { icon: "📊", title: "Crypto, stocks & CSV", text: "Backtest on crypto pairs, US stocks, or your own exported price data." },
];

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="container">
        <h2 className="section-title">From idea to tested strategy</h2>
        <p className="section-sub">Everything you need to check a trading idea against history, without writing code.</p>
        <div className="features three">
          {features.map((f) => (
            <article key={f.title} className="feature">
              <span className="feature-icon">{f.icon}</span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
