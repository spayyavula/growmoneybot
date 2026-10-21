// Preview build: the real web app on a mock API (see mockApi.js), with hash routing so it
// works as a single hosted page. Opens logged in as a demo user.
import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { installMockApi } from "./mockApi.js";
import App from "../App.jsx";
import { AuthProvider } from "../lib/auth.jsx";
import { ThemeProvider } from "../lib/theme.jsx";
import "../index.css";
import "../app.css";
import "../market.css";
import "./preview.css";

installMockApi();
try { if (!localStorage.getItem("gmb_token")) localStorage.setItem("gmb_token", "preview"); } catch { /* storage blocked: log in with any email */ }
if (!window.location.hash || window.location.hash === "#/") window.location.hash = "#/app";

function PreviewBar() {
  return (
    <div className="preview-bar" role="note">
      <b>Preview</b> · PRs #3 + #4 + #5 · sample prices, nothing is saved ·{" "}
      <a href="#/app/strategies/new">Builder</a> · <a href="#/app/marketplace">Marketplace</a> · <a href="#/app/signals">Alerts</a>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider>
      <HashRouter>
        <AuthProvider>
          <PreviewBar />
          <App />
        </AuthProvider>
      </HashRouter>
    </ThemeProvider>
  </React.StrictMode>
);
