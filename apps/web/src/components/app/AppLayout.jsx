import { NavLink, Link, Outlet } from "react-router-dom";
import Logo from "../Logo.jsx";
import ThemeToggle from "../ThemeToggle.jsx";
import { useAuth } from "../../lib/auth.jsx";

const Icon = ({ d }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d.map((p) => <path key={p} d={p} />)}
  </svg>
);

const NAV = [
  { to: "/app", end: true, label: "Strategies", icon: ["M3 17l5-5 4 4 8-8", "M15 8h5v5"] },
  { to: "/app/marketplace", label: "Marketplace", icon: ["M4 9l1.5-5h13L20 9", "M4 9h16v2a3 3 0 0 1-5.3 2 3 3 0 0 1-5.4 0A3 3 0 0 1 4 11z", "M5 13.5V20h14v-6.5", "M10 20v-4h4v4"] },
  { to: "/app/signals", label: "Alerts", icon: ["M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9", "M10.3 21a1.9 1.9 0 0 0 3.4 0"] },
  { to: "/app/pine", label: "Pine Lab", icon: ["M8 3h8", "M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3"] },
  { to: "/app/account", label: "Account", icon: ["M20 21a8 8 0 0 0-16 0", "M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  return (
    <div className="app">
      <header className="app-top">
        <Link to="/app" className="brand">
          <Logo size={30} />
          <span>GrowMoney<b>Bot</b></span>
        </Link>
        <nav className="app-nav-top" aria-label="Main">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end}>{n.label === "Alerts" ? "TradingView alerts" : n.label}</NavLink>)}
        </nav>
        <div className="app-user">
          <span className="muted small email">{user?.email}</span>
          <ThemeToggle />
          <button className="btn btn-plain btn-small" onClick={logout}>Log out</button>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <footer className="app-foot muted tiny">
        Backtests are hypothetical and use historical data; they don't account for every real-world cost and
        don't predict future results. GrowMoneyBot is an educational tool, not financial advice.
      </footer>

      <nav className="tabbar" aria-label="Main">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end}>
            <Icon d={n.icon} />
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
