import { Router } from "express";
import mongoose from "mongoose";
import PineScript from "../models/PineScript.js";
import { connectDB } from "../db.js";
import { requireAuth, wrap } from "../auth.js";

// Saved Pine scripts for the Pine Lab
const router = Router();
router.use(requireAuth);

const pick = (b = {}) => ({
  ...(b.name !== undefined && { name: String(b.name) }),
  ...(b.code !== undefined && { code: String(b.code) }),
});

router.get("/", wrap(async (req, res) => {
  await connectDB();
  const scripts = await PineScript.find({ user: req.userId }).sort({ updatedAt: -1 }).limit(200).lean();
  res.json({ ok: true, scripts });
}));

router.post("/", wrap(async (req, res) => {
  await connectDB();
  if ((await PineScript.countDocuments({ user: req.userId })) >= 200)
    return res.status(400).json({ ok: false, error: "Script limit reached (200)" });
  const script = await PineScript.create({ ...pick(req.body), user: req.userId });
  res.status(201).json({ ok: true, script });
}));

router.put("/:id", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Not found" });
  await connectDB();
  const script = await PineScript.findOneAndUpdate(
    { _id: req.params.id, user: req.userId }, { $set: pick(req.body) }, { new: true, runValidators: true }
  );
  if (!script) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true, script });
}));

router.delete("/:id", wrap(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ ok: false, error: "Not found" });
  await connectDB();
  const r = await PineScript.deleteOne({ _id: req.params.id, user: req.userId });
  if (!r.deletedCount) return res.status(404).json({ ok: false, error: "Not found" });
  res.json({ ok: true });
}));

export default router;
