import mongoose from "mongoose";

// One alert for a user: a TradingView alert sent to their webhook URL, or a trade by a
// marketplace algorithm they follow.
const signalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    source: { type: String, enum: ["tradingview", "marketplace"], default: "tradingview" },
    // Marketplace alerts: which algorithm and version traded
    algorithm: { type: mongoose.Schema.Types.ObjectId, ref: "Algorithm" },
    algorithmName: { type: String, maxlength: 80 },
    algorithmVersion: Number,
    pending: Boolean, // signal on the last closed bar; fills at the next open
    reason: { type: String, maxlength: 20 },
    pnlPct: Number,
    message: { type: String, maxlength: 300 },
    strategyId: { type: String, maxlength: 64 },
    type: { type: String, maxlength: 20 },
    action: { type: String, maxlength: 20 },
    ticker: { type: String, maxlength: 40 },
    exchange: { type: String, maxlength: 40 },
    interval: { type: String, maxlength: 10 },
    price: Number,
    raw: { type: String, maxlength: 4000 },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }, // keep 90 days
  }
);

signalSchema.index({ user: 1, createdAt: -1 });

export default mongoose.models.Signal || mongoose.model("Signal", signalSchema);
