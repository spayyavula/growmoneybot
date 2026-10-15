import { Router } from "express";
import Subscriber from "../models/Subscriber.js";
import { connectDB } from "../db.js";

const router = Router();

// POST /api/subscribers  -> join the waitlist
router.post("/", async (req, res) => {
  try {
    await connectDB();
    const { name, email, interest } = req.body || {};
    const sub = await Subscriber.create({ name, email, interest });
    res.status(201).json({ ok: true, id: sub._id, message: "You're on the list!" });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(200).json({ ok: true, message: "You're already on the list!" });
    }
    if (err.name === "ValidationError") {
      const msg = Object.values(err.errors)[0]?.message || "Invalid input";
      return res.status(400).json({ ok: false, error: msg });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error, please try again." });
  }
});

// GET /api/subscribers/count -> public waitlist count
router.get("/count", async (_req, res) => {
  try {
    await connectDB();
    const count = await Subscriber.estimatedDocumentCount();
    res.json({ ok: true, count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
