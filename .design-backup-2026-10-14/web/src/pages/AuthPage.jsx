import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import Logo from "../components/Logo.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function AuthPage({ mode }) {
  const isSignup = mode === "signup";
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [status, setStatus] = useState({ state: "idle", msg: "" });

  if (user) return <Navigate to="/app" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus({ state: "loading", msg: "" });
    try {
      if (isSignup) await signup(form);
      else await login({ email: form.email, password: form.password });
      navigate(location.state?.from || "/app", { replace: true });
    } catch (err) {
      setStatus({ state: "error", msg: err.message });
    }
  };
  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="auth-page">
      <form className="auth-card" onSubmit={onSubmit}>
        <Link to="/" className="brand"><Logo size={34} /><span>GrowMoney<b>Bot</b></span></Link>
        <h1>{isSignup ? "Create your account" : "Welcome back"}</h1>
        {isSignup && (
          <label className="field"><span>Name</span><input value={form.name} onChange={update("name")} autoComplete="name" /></label>
        )}
        <label className="field"><span>Email</span><input type="email" required value={form.email} onChange={update("email")} autoComplete="email" /></label>
        <label className="field">
          <span>Password{isSignup && " (8+ characters)"}</span>
          <input type="password" required minLength={isSignup ? 8 : undefined} value={form.password} onChange={update("password")} autoComplete={isSignup ? "new-password" : "current-password"} />
        </label>
        <button className="btn" disabled={status.state === "loading"}>
          {status.state === "loading" ? "Please wait…" : isSignup ? "Create account" : "Log in"}
        </button>
        {status.msg && <p className={`form-msg ${status.state}`}>{status.msg}</p>}
        <p className="muted small">
          {isSignup ? <>Already have an account? <Link to="/login">Log in</Link></> : <>New here? <Link to="/signup">Create an account</Link></>}
        </p>
      </form>
    </div>
  );
}
