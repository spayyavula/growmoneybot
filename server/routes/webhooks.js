import { Router } from "express";
import express from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Signal from "../models/Signal.js";
import Strategy from "../models/Strategy.js";
import { sendPush, signalNotification } from "../push.js";
import { connectDB } from "../db.js";
import { requireAuth, wrap } from "../auth.js";

export const webhookRouter = Router();
export const signalsRouter = Router();

const str = (v, max) => (v == null ? undefined : String(v).slice(0, max));

/**
 * TradingView alert webhook: POST /api/webhooks/tv/<webhookToken>
 * TradingView sends JSON (application/json) when the alert message is valid
 * JSON, otherwise plain text. Both are accepted and stored.
 */
webhookRouter.post(
  "/tv/:token",
  express.text({ type: "*/*", limit: "8kb" }),
  wrap(async (req, res) => {
    const token = req.params.token;
    if (!/^[a-f0-9]{48}$/.test(token)) return res.status(404).json({ ok: false });
    await connectDB();
    const user = await User.findOne({ webhookToken: token }).select("_id notifyOnSignals devices").lean();
    if (!user) return res.status(404).json({ ok: false });

    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? "");
    let data = {};
    try { data = JSON.parse(raw); } catch { /* plain-text alert */ }
    if (typeof data !== "object" || data === null) data = {};

    const price = Number(data.price);
    const signal = await Signal.create({
      user: user._id,
      strategyId: str(data.strategyId, 64),
      type: str(data.type, 20),
      action: str(data.action, 20),
      ticker: str(data.ticker, 40),
      exchange: str(data.exchange, 40),
      interval: str(data.interval, 10),
      price: Number.isFinite(price) ? price : undefined,
      raw: raw.slice(0, 4000),
    });

    // Push to the user's phones. Awaited (with a short timeout inside sendPush) because a
    // serverless function may be frozen as soon as the response is sent.
    const tokens = (user.devices || []).map((d) => d.token);
    if (user.notifyOnSignals !== false && tokens.length) {
      let strategyName;
      if (signal.strategyId && mongoose.isValidObjectId(signal.strategyId)) {
        strategyName = (await Strategy.findOne({ _id: signal.strategyId, user: user._id }).select("name").lean())?.name;
      }
      const { dead } = await sendPush(tokens, signalNotification(signal, strategyName));
      if (dead.length) await User.updateOne({ _id: user._id }, { $pull: { devices: { token: { $in: dead } } } });
    }
    res.json({ ok: true });
  })
);

signalsRouter.use(requireAuth);

signalsRouter.get("/", wrap(async (req, res) => {
  await connectDB();
  const filter = { user: req.userId };
  if (req.query.strategyId) filter.strategyId = String(req.query.strategyId).slice(0, 64);
  const signals = await Signal.find(filter).sort({ createdAt: -1 }).limit(200).lean();
  res.json({ ok: true, signals });
}));

signalsRouter.delete("/", wrap(async (req, res) => {
  await connectDB();
  await Signal.deleteMany({ user: req.userId });
  res.json({ ok: true });
}));
