import { Router } from "express";
import Message from "../models/Message.js";
import { connectDB } from "../db.js";

const router = Router();

// POST /api/contact -> save a contact-form message
router.post("/", async (req, res) => {
  try {
    await connectDB();
    const { name, email, message } = req.body || {};
    await Message.create({ name, email, message });
    res.status(201).json({ ok: true, message: "Thanks! We'll get back to you soon." });
  } catch (err) {
    if (err.name === "ValidationError") {
      const msg = Object.values(err.errors)[0]?.message || "Invalid input";
      return res.status(400).json({ ok: false, error: msg });
    }
    console.error(err);
    res.status(500).json({ ok: false, error: "Server error, please try again." });
  }
});

export default router;
