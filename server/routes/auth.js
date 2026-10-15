import { Router } from "express";
import bcrypt from "bcryptjs";
import User, { newWebhookToken } from "../models/User.js";
import { connectDB } from "../db.js";
import { requireAuth, signToken, wrap } from "../auth.js";

const router = Router();

router.post("/signup", wrap(async (req, res) => {
  await connectDB();
  const { name, email, password } = req.body || {};
  if (typeof password !== "string" || password.length < 8)
    return res.status(400).json({ ok: false, error: "Password must be at least 8 characters" });
  if (password.length > 200) return res.status(400).json({ ok: false, error: "Password is too long" });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const user = await User.create({ name, email, passwordHash });
    res.status(201).json({ ok: true, token: signToken(user._id), user: user.toPublic() });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ ok: false, error: "An account with that email already exists" });
    throw err;
  }
}));

router.post("/login", wrap(async (req, res) => {
  await connectDB();
  const { email, password } = req.body || {};
  const user = await User.findOne({ email: String(email || "").toLowerCase().trim() }).select("+passwordHash");
  const ok = user && (await bcrypt.compare(String(password || ""), user.passwordHash));
  if (!ok) return res.status(401).json({ ok: false, error: "Incorrect email or password" });
  res.json({ ok: true, token: signToken(user._id), user: user.toPublic() });
}));

router.get("/me", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  res.json({ ok: true, user: user.toPublic() });
}));

// Account settings (currently: push notifications for TradingView alerts)
router.put("/settings", requireAuth, wrap(async (req, res) => {
  const patch = {};
  if (typeof req.body?.notifyOnSignals === "boolean") patch.notifyOnSignals = req.body.notifyOnSignals;
  if (typeof req.body?.name === "string") patch.name = req.body.name.slice(0, 80);
  await connectDB();
  const user = await User.findByIdAndUpdate(req.userId, { $set: patch }, { new: true, runValidators: true });
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  res.json({ ok: true, user: user.toPublic() });
}));

// Permanently delete the account and everything stored for it (required by the App Store).
// Requires the current password so a stolen session token alone can't wipe an account.
router.delete("/account", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await User.findById(req.userId).select("+passwordHash");
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  if (!(await bcrypt.compare(String(req.body?.password || ""), user.passwordHash)))
    return res.status(403).json({ ok: false, error: "Incorrect password" });
  const [{ default: Strategy }, { default: PineScript }, { default: Signal }, { default: Algorithm }, { default: AlgoDataset }, { default: Follow }] = await Promise.all([
    import("../models/Strategy.js"), import("../models/PineScript.js"), import("../models/Signal.js"),
    import("../models/Algorithm.js"), import("../models/AlgoDataset.js"), import("../models/Follow.js"),
  ]);
  // Marketplace: remove the user's published algorithms (and their datasets/follows) and their follows
  const algos = await Algorithm.find({ author: user._id }).select("_id").lean();
  const algoIds = algos.map((a) => a._id);
  const myFollows = await Follow.find({ user: user._id }).select("algorithm").lean();
  await Promise.all([
    Strategy.deleteMany({ user: user._id }),
    PineScript.deleteMany({ user: user._id }),
    Signal.deleteMany({ user: user._id }),
    Algorithm.deleteMany({ _id: { $in: algoIds } }),
    AlgoDataset.deleteMany({ algorithm: { $in: algoIds } }),
    Follow.deleteMany({ $or: [{ user: user._id }, { algorithm: { $in: algoIds } }] }),
    ...myFollows.map((f) => Algorithm.updateOne({ _id: f.algorithm, followers: { $gt: 0 } }, { $inc: { followers: -1 } })),
  ]);
  await User.deleteOne({ _id: user._id });
  res.json({ ok: true });
}));

// Issue a new webhook token (invalidates the old TradingView webhook URL)
router.post("/webhook-token", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await User.findByIdAndUpdate(req.userId, { webhookToken: newWebhookToken() }, { new: true });
  res.json({ ok: true, user: user.toPublic() });
}));

export default router;
