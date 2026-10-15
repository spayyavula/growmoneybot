import { useState } from "react";
import { Link } from "react-router-dom";
import Logo from "./Logo.jsx";
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
  return (
    <header className="nav">
      <div className="container nav-inner">
        <a href="#top" className="brand">
          <Logo size={34} />
          <span>GrowMoney<b>Bot</b></span>
        </a>
        <button className="nav-toggle" aria-label="Menu" onClick={() => setOpen(!open)}>
          <span /><span /><span />
        </button>
        <nav className={`nav-links ${open ? "open" : ""}`}>
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
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
      </div>
    </header>
  );
}
