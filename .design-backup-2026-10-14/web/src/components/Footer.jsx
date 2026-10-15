import Logo from "./Logo.jsx";

export default function Footer() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div className="brand">
          <Logo size={28} />
          <span>GrowMoney<b>Bot</b></span>
        </div>
        <p className="muted tiny disclaimer">
          GrowMoneyBot provides educational tools and general information only. It is not
          financial, investment, tax or legal advice. Backtest results are hypothetical and do not
          guarantee future performance. Trading involves risk, including loss of principal.
          TradingView and Pine Script are trademarks of TradingView, Inc.; GrowMoneyBot is not affiliated with TradingView.
        </p>
        <p className="muted tiny">© {new Date().getFullYear()} growmoneybot.com</p>
      </div>
    </footer>
  );
}
