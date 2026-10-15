import { Router } from "express";
import User from "../models/User.js";
import { connectDB } from "../db.js";
import { requireAuth, wrap } from "../auth.js";
import { isExpoPushToken } from "../push.js";

// Register / remove a phone's Expo push token for the signed-in user.
const router = Router();
router.use(requireAuth);

const MAX_DEVICES = 10;

router.post("/", wrap(async (req, res) => {
  const { token, platform, name } = req.body || {};
  if (!isExpoPushToken(token)) return res.status(400).json({ ok: false, error: "Invalid push token" });
  await connectDB();
  // The same phone may have been registered by another account before — move it to this one
  await User.updateMany({ _id: { $ne: req.userId } }, { $pull: { devices: { token } } });
  const user = await User.findById(req.userId).select("+devices");
  if (!user) return res.status(401).json({ ok: false, error: "Account not found" });
  const rest = user.devices.filter((d) => d.token !== token);
  user.devices = [
    { token, platform: ["ios", "android", "web"].includes(platform) ? platform : "ios", name: String(name || "").slice(0, 80) },
    ...rest,
  ].slice(0, MAX_DEVICES);
  await user.save();
  res.json({ ok: true });
}));

router.delete("/", wrap(async (req, res) => {
  const { token } = req.body || {};
  if (typeof token !== "string") return res.status(400).json({ ok: false, error: "Missing token" });
  await connectDB();
  await User.updateOne({ _id: req.userId }, { $pull: { devices: { token } } });
  res.json({ ok: true });
}));

export default router;
