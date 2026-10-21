import { Router } from "express";
import User from "../models/User.js";
import { connectDB } from "../db.js";
import { requireAuth, wrap } from "../auth.js";
import { describeStrategy } from "../describe.js";

// POST /api/describe { text, market?, symbol?, interval? } → rules from a plain-English description
const router = Router();
router.use(requireAuth);

export const DAILY_LIMIT = Number(process.env.DESCRIBE_DAILY_LIMIT) || 50;

// Count AI translations per user per day (the built-in parser is free and unlimited)
async function takeQuota(userId) {
  const day = new Date().toISOString().slice(0, 10);
  const same = await User.updateOne(
    { _id: userId, "describeUsage.day": day, "describeUsage.count": { $lt: DAILY_LIMIT } },
    { $inc: { "describeUsage.count": 1 } }
  );
  if (same.modifiedCount) return true;
  const fresh = await User.updateOne({ _id: userId, "describeUsage.day": { $ne: day } }, { $set: { describeUsage: { day, count: 1 } } });
  return fresh.modifiedCount === 1;
}

router.post("/", wrap(async (req, res) => {
  const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
  if (text.length < 10) return res.status(400).json({ ok: false, error: "Describe your strategy in a sentence or two: when to buy, when to sell." });
  if (text.length > 1500) return res.status(400).json({ ok: false, error: "Keep the description under 1,500 characters." });
  const b = req.body || {};
  const base = {
    ...(["crypto", "stocks"].includes(b.market) && { market: b.market }),
    ...(typeof b.symbol === "string" && /^[A-Z0-9.\-]{1,20}$/.test(b.symbol) && { symbol: b.symbol }),
    ...(["15m", "1h", "4h", "1d", "1w"].includes(b.interval) && { interval: b.interval }),
  };

  let apiKey = process.env.ANTHROPIC_API_KEY;
  let note;
  if (apiKey) {
    await connectDB();
    if (!(await takeQuota(req.userId))) {
      apiKey = undefined; // over today's AI limit: use the built-in parser
      note = `You've used today's ${DAILY_LIMIT} AI translations, so the built-in parser read this one. It understands common phrasings only.`;
    }
  }
  const result = await describeStrategy(text, { apiKey, base });
  res.json({ ok: true, ...result, ...(note && { note }) });
}));

export default router;
