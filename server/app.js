import express from "express";
import cors from "cors";
import subscribersRouter from "./routes/subscribers.js";
import contactRouter from "./routes/contact.js";
import authRouter from "./routes/auth.js";
import strategiesRouter from "./routes/strategies.js";
import pineRouter from "./routes/pine.js";
import marketRouter from "./routes/market.js";
import devicesRouter from "./routes/devices.js";
import { webhookRouter, signalsRouter } from "./routes/webhooks.js";

const app = express();

app.disable("x-powered-by");
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));

// Netlify rewrites /api/* -> /.netlify/functions/api/*.
// Mount the router on both prefixes so it works in Netlify and locally.
const api = express.Router();

// TradingView webhooks parse their own body (JSON or plain text), so they're mounted
// before the JSON parser — a malformed JSON alert must still be accepted and stored.
api.use("/webhooks", webhookRouter);
api.use(express.json({ limit: "200kb" }));

api.get("/health", (_req, res) =>
  res.json({ ok: true, service: "growmoneybot-api", time: new Date().toISOString() })
);
api.use("/subscribers", subscribersRouter);
api.use("/contact", contactRouter);
api.use("/auth", authRouter);
api.use("/strategies", strategiesRouter);
api.use("/pine", pineRouter);
api.use("/market", marketRouter);
api.use("/devices", devicesRouter);
api.use("/signals", signalsRouter);

app.use("/api", api);
app.use("/.netlify/functions/api", api);

app.use((_req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// Central error handler
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  if (err.type === "entity.too.large") return res.status(413).json({ ok: false, error: "Request too large" });
  if (err.type === "entity.parse.failed") return res.status(400).json({ ok: false, error: "Invalid JSON" });
  if (err.name === "ValidationError") {
    const msg = Object.values(err.errors || {})[0]?.message || err.message;
    return res.status(400).json({ ok: false, error: msg });
  }
  if (err.message && /condition|indicator|comparison/i.test(err.message) && !err.status) {
    return res.status(400).json({ ok: false, error: err.message });
  }
  console.error(err);
  res.status(500).json({ ok: false, error: "Server error, please try again." });
});

export default app;
