import { Router } from "express";
import mongoose from "mongoose";
import Strategy from "../models/Strategy.js";
import { connectDB } from "../db.js";
import { requireAuth, wrap } from "../auth.js";

const router = Router();
router.use(requireAuth);

const OPERAND_TYPES = new Set(["price", "value", "sma", "ema", "rsi", "macd", "bb", "atr", "stoch", "volume"]);
const OPS = new Set(["crossesAbove", "crossesBelow", ">", "<", ">=", "<="]);
const MAX_CONDITIONS = 10;

function cleanOperand(op) {
  if (!op || !OPERAND_TYPES.has(op.type)) throw new Error("Invalid indicator in a condition");
  const params = {};
  for (const [k, v] of Object.entries(op.params || {})) {
    if (!/^[a-zA-Z]{1,20}$/.test(k)) continue;
    if (k === "source") params[k] = ["close", "open", "high", "low", "hl2", "hlc3", "ohlc4"].includes(v) ? v : "close";
    else if (Number.isFinite(Number(v))) params[k] = Number(v);
  }
  const out = { type: op.type, params };
  if (typeof op.field === "string" && /^[a-z]{1,10}$/.test(op.field)) out.field = op.field;
  return out;
}

function cleanGroup(g) {
  const conditions = Array.isArray(g?.conditions) ? g.conditions : [];
  if (conditions.length > MAX_CONDITIONS) throw new Error(`Up to ${MAX_CONDITIONS} conditions per rule`);
  return {
    logic: g?.logic === "any" ? "any" : "all",
    conditions: conditions.map((c) => {
      if (!OPS.has(c?.op)) throw new Error("Invalid comparison in a condition");
      return { left: cleanOperand(c.left), op: c.op, right: cleanOperand(c.right) };
    }),
  };
}

function cleanBody(body = {}) {
  const out = {};
  for (const k of ["name", "description", "market", "symbol", "interval", "bars", "direction", "risk"]) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  if (body.entry !== undefined) out.entry = cleanGroup(body.entry);
  if (body.exit !== undefined) out.exit = cleanGroup(body.exit);
  return out;
}

const validId = (id) => mongoose.isValidObjectId(id);

router.get("/", wrap(async (req, res) => {
  await connectDB();
  const items = await Strategy.find({ user: req.userId }).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ ok: true, strategies: items });
}));

router.post("/", wrap(async (req, res) => {
  await connectDB();
  const count = await Strategy.countDocuments({ user: req.userId });
  if (count >= 200) return res.status(400).json({ ok: false, error: "Strategy limit reached (200)" });
  const doc = await Strategy.create({ ...cleanBody(req.body), user: req.userId });
  res.status(201).json({ ok: true, strategy: doc });
}));

router.get("/:id", wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ ok: false, error: "Not found" });
  await connectDB();
  const doc = await Strategy.findOne({ _id: req.params.id, user: req.userId }).lean();
  if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, strategy: doc });
}));

router.put("/:id", wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ ok: false, error: "Not found" });
  await connectDB();
  const doc = await Strategy.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },
    { $set: cleanBody(req.body) },
    { new: true, runValidators: true }
  );
  if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, strategy: doc });
}));

// Store a summary of the latest backtest (the backtest itself runs in the browser)
router.post("/:id/backtest", wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ ok: false, error: "Not found" });
  await connectDB();
  const m = req.body?.metrics || {};
  const metrics = {};
  for (const [k, v] of Object.entries(m)) if (/^[a-zA-Z]{1,30}$/.test(k) && typeof v === "number") metrics[k] = Number.isFinite(v) ? v : null;
  const doc = await Strategy.findOneAndUpdate(
    { _id: req.params.id, user: req.userId },
    { $set: { lastBacktest: { metrics, ranAt: new Date() } } },
    { new: true }
  );
  if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, strategy: doc });
}));

router.delete("/:id", wrap(async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ ok: false, error: "Not found" });
  await connectDB();
  const r = await Strategy.deleteOne({ _id: req.params.id, user: req.userId });
  if (!r.deletedCount) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
}));

export default router;
