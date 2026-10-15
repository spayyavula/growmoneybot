import { Router } from "express";
import mongoose from "mongoose";
import User from "../models/User.js";
import Algorithm from "../models/Algorithm.js";
import { connectDB } from "../db.js";
import { requireAuth, isAdminEmail, wrap } from "../auth.js";
import { cardView } from "../algorithms.js";

// Admin review for the expert program and marketplace. Admins are set with ADMIN_EMAILS.
const router = Router();
router.use(requireAuth);
router.use(wrap(async (req, res, next) => {
  await connectDB();
  const user = await User.findById(req.userId);
  if (!user || !isAdminEmail(user.email)) return res.status(403).json({ ok: false, error: "Admins only" });
  req.admin = user;
  next();
}));

const note = (v) => (typeof v === "string" ? v.trim().slice(0, 500) : "");
const applicant = (u) => ({ id: u._id, email: u.email, name: u.name, createdAt: u.createdAt, expert: u.expertProfile(true) });

router.get("/experts", wrap(async (req, res) => {
  const status = ["pending", "approved", "rejected", "revoked"].includes(req.query.status) ? req.query.status : "pending";
  const users = await User.find({ "expert.status": status }).sort({ "expert.appliedAt": 1 }).limit(200);
  res.json({ ok: true, experts: users.map(applicant) });
}));

async function review(req, res, from, to, { needNote = false } = {}) {
  if (!mongoose.isValidObjectId(req.params.id)) { res.status(404).json({ ok: false, error: "User not found" }); return null; }
  const user = await User.findById(req.params.id);
  if (!user) { res.status(404).json({ ok: false, error: "User not found" }); return null; }
  if (!from.includes(user.expert?.status)) { res.status(400).json({ ok: false, error: `Can't change an application that is ${user.expert?.status || "missing"}` }); return null; }
  const n = note(req.body?.note);
  if (needNote && !n) { res.status(400).json({ ok: false, error: "Add a short note explaining the decision" }); return null; }
  user.expert.status = to;
  user.expert.reviewedAt = new Date();
  user.expert.reviewNote = n;
  await user.save();
  return user;
}

router.post("/experts/:id/approve", wrap(async (req, res) => {
  const user = await review(req, res, ["pending", "rejected", "revoked"], "approved");
  if (user) res.json({ ok: true, expert: applicant(user) });
}));

router.post("/experts/:id/reject", wrap(async (req, res) => {
  const user = await review(req, res, ["pending"], "rejected", { needNote: true });
  if (user) res.json({ ok: true, expert: applicant(user) });
}));

// Revoking also takes the expert's algorithms out of the marketplace
router.post("/experts/:id/revoke", wrap(async (req, res) => {
  const user = await review(req, res, ["approved"], "revoked", { needNote: true });
  if (!user) return;
  await Algorithm.updateMany({ author: user._id, status: { $ne: "removed" } }, { $set: { status: "removed", removedReason: `Expert access revoked: ${user.expert.reviewNote}` } });
  res.json({ ok: true, expert: applicant(user) });
}));

router.get("/algorithms", wrap(async (req, res) => {
  const status = ["published", "unlisted", "removed"].includes(req.query.status) ? req.query.status : "published";
  const items = await Algorithm.find({ status }).sort({ updatedAt: -1 }).limit(200).populate("author", "name email expert");
  res.json({ ok: true, algorithms: items.map((a) => ({ ...cardView(a), removedReason: a.removedReason, authorEmail: a.author?.email })) });
}));

router.post("/algorithms/:id/remove", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Algorithm not found" });
  const reason = note(req.body?.reason);
  if (!reason) return res.status(400).json({ ok: false, error: "Add the reason the expert will see" });
  const algo = await Algorithm.findByIdAndUpdate(req.params.id, { $set: { status: "removed", removedReason: reason } }, { new: true });
  if (!algo) return res.status(404).json({ ok: false, error: "Algorithm not found" });
  res.json({ ok: true });
}));

router.post("/algorithms/:id/restore", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Algorithm not found" });
  const algo = await Algorithm.findByIdAndUpdate(req.params.id, { $set: { status: "unlisted" }, $unset: { removedReason: 1 } }, { new: true });
  if (!algo) return res.status(404).json({ ok: false, error: "Algorithm not found" });
  res.json({ ok: true });
}));

export default router;
