// Line icons drawn in the spirit of SF Symbols, shown in tinted rounded squares.
const I = {
  builder: ["M4 6h7v5H4z", "M13 13h7v5h-7z", "M11 8.5h3.5a2 2 0 0 1 2 2V13", "M7.5 11v4.5a2 2 0 0 0 2 2H13"],
  backtest: ["M3 12a9 9 0 1 0 3-6.7", "M3 4v4h4", "M12 7.5V12l3 2"],
  code: ["M8.5 7L4 12l4.5 5", "M15.5 7L20 12l-4.5 5", "M13.5 5l-3 14"],
  bell: ["M6 9a6 6 0 1 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9", "M10.3 20.5a1.9 1.9 0 0 0 3.4 0"],
  lab: ["M9 3h6", "M10 3v6l-5.2 9.2A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.8L14 9V3", "M7.2 15h9.6"],
  chart: ["M4 20V4", "M4 20h16", "M8 16v-4", "M12 16V8", "M16 16v-6"],
};

const features = [
  { icon: I.builder, title: "No-code strategy builder", text: "Combine SMA, EMA, RSI, MACD, Bollinger Bands, ATR, Stochastic and price into entry and exit rules." },
  { icon: I.backtest, title: "Realistic backtests", text: "Orders fill at the next bar's open, with fees, stop losses and take profits, the same way TradingView's strategy tester works." },
  { icon: I.code, title: "One-click Pine Script", text: "Every strategy becomes a Pine Script v6 strategy you can paste straight into TradingView." },
  { icon: I.bell, title: "TradingView alerts", text: "Point your TradingView alerts at your personal webhook and see every signal in one place." },
  { icon: I.lab, title: "Pine Lab", text: "Already have Pine scripts? Paste them in and run them on crypto or stock charts right here." },
  { icon: I.chart, title: "Crypto, stocks & CSV", text: "Backtest on crypto pairs, US stocks, or your own exported price data." },
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
              <span className="feature-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {f.icon.map((d) => <path key={d} d={d} />)}
                </svg>
              </span>
              <h3>{f.title}</h3>
              <p>{f.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
