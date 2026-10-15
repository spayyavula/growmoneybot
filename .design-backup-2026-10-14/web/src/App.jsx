import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing.jsx";
import AuthPage from "./pages/AuthPage.jsx";
import { RequireAuth } from "./lib/auth.jsx";

// App pages load on demand so the landing page stays light on phones
const AppLayout = lazy(() => import("./components/app/AppLayout.jsx"));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx"));
const StrategyEditor = lazy(() => import("./pages/StrategyEditor.jsx"));
const PineLab = lazy(() => import("./pages/PineLab.jsx"));
const Signals = lazy(() => import("./pages/Signals.jsx"));
const Account = lazy(() => import("./pages/Account.jsx"));

export default function App() {
  return (
    <Suspense fallback={<div className="page-loading">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<AuthPage mode="login" />} />
        <Route path="/signup" element={<AuthPage mode="signup" />} />
        <Route path="/app" element={<RequireAuth><AppLayout /></RequireAuth>}>
          <Route index element={<Dashboard />} />
          <Route path="strategies/:id" element={<StrategyEditor />} />
          <Route path="pine" element={<PineLab />} />
          <Route path="signals" element={<Signals />} />
          <Route path="account" element={<Account />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
