import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Algorithm from "../models/Algorithm.js";
import { connectDB } from "../db.js";
import { requireAuth, wrap } from "../auth.js";
import { cardView } from "../algorithms.js";

// Expert program: apply to publish, manage your public profile, view an expert's page.
const router = Router();

const MARKETS = ["crypto", "stocks"];
const str = (v, max) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const url = (v) => {
  const s = str(v, 200);
  if (!s) return "";
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); return /^https?:$/.test(u.protocol) ? u.toString() : ""; } catch { return ""; }
};

function cleanProfile(body = {}) {
  return {
    displayName: str(body.displayName, 60),
    bio: str(body.bio, 1200),
    experience: str(body.experience, 1200),
    markets: (Array.isArray(body.markets) ? body.markets : []).filter((m) => MARKETS.includes(m)),
    links: { website: url(body.links?.website), x: url(body.links?.x), tradingview: url(body.links?.tradingview) },
  };
}

router.get("/me", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  res.json({ ok: true, expert: user.expertProfile(true) });
}));

// Apply (or re-apply after a rejection). Approved experts use PUT /me to edit their profile.
router.post("/apply", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  const status = user.expert?.status || "none";
  if (status === "approved") return res.status(400).json({ ok: false, error: "You're already an approved expert" });
  if (status === "revoked") return res.status(403).json({ ok: false, error: "Your expert access was revoked. Contact us to discuss it." });
  const p = cleanProfile(req.body);
  if (p.displayName.length < 2) return res.status(400).json({ ok: false, error: "Add the name traders will see" });
  if (p.bio.length < 40) return res.status(400).json({ ok: false, error: "Tell traders a little more about your approach (40+ characters)" });
  if (p.experience.length < 40) return res.status(400).json({ ok: false, error: "Describe your trading experience (40+ characters)" });
  if (!p.markets.length) return res.status(400).json({ ok: false, error: "Pick at least one market you trade" });
  user.expert = { ...p, status: "pending", appliedAt: new Date(), reviewedAt: undefined, reviewNote: "" };
  await user.save();
  res.json({ ok: true, user: user.toPublic() });
}));

router.put("/me", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await User.findById(req.userId);
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  if (user.expert?.status !== "approved" && user.expert?.status !== "pending")
    return res.status(403).json({ ok: false, error: "Apply to the expert program first" });
  const p = cleanProfile({ ...user.expertProfile(true), ...req.body, links: { ...user.expertProfile(true).links, ...req.body?.links } });
  if (p.displayName.length < 2) return res.status(400).json({ ok: false, error: "Add the name traders will see" });
  Object.assign(user.expert, p);
  await user.save();
  res.json({ ok: true, user: user.toPublic() });
}));

// Public expert page
router.get("/:id", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Expert not found" });
  await connectDB();
  const user = await User.findById(req.params.id);
  if (!user || user.expert?.status !== "approved") return res.status(404).json({ ok: false, error: "Expert not found" });
  const algos = await Algorithm.find({ author: user._id, status: "published" }).sort({ publishedAt: -1 }).populate("author", "name expert");
  res.json({ ok: true, expert: { id: user._id, ...user.expertProfile(false), memberSince: user.createdAt }, algorithms: algos.map(cardView) });
}));

export default router;
