import mongoose from "mongoose";

// One TradingView alert delivered to a user's webhook URL.
const signalSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
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
