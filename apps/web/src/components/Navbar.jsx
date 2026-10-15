import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import Logo from "./Logo.jsx";
import ThemeToggle from "./ThemeToggle.jsx";
import { useAuth } from "../lib/auth.jsx";

const links = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#calculator", label: "Calculator" },
  { href: "#contact", label: "Contact" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  // Section links point at the landing page when shown on other public pages
  const onLanding = useLocation().pathname === "/";
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a href={onLanding ? "#top" : "/"} className="brand">
          <Logo size={34} />
          <span>GrowMoney<b>Bot</b></span>
        </a>
        <nav className={`nav-links ${open ? "open" : ""}`}>
          <Link to="/marketplace" onClick={() => setOpen(false)}>Marketplace</Link>
          {links.map((l) => (
            <a key={l.href} href={onLanding ? l.href : `/${l.href}`} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          {user ? (
            <Link to="/app" className="btn btn-small">Open app</Link>
          ) : (
            <>
              <Link to="/login">Log in</Link>
              <Link to="/signup" className="btn btn-small">Get started</Link>
            </>
          )}
        </nav>
        <div className="nav-end">
          <ThemeToggle />
          <button className="nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span /><span /><span />
          </button>
        </div>
      </div>
    </header>
  );
}
