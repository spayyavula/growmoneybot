import mongoose from "mongoose";

const ruleGroup = {
  logic: { type: String, enum: ["all", "any"], default: "all" },
  // [{ left: operand, op, right: operand }] — validated in the route
  conditions: { type: [mongoose.Schema.Types.Mixed], default: [] },
};

const strategySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    market: { type: String, enum: ["crypto", "stocks", "csv"], default: "crypto" },
    symbol: { type: String, trim: true, uppercase: true, maxlength: 20, default: "BTCUSDT" },
    interval: { type: String, enum: ["15m", "1h", "4h", "1d", "1w"], default: "1d" },
    bars: { type: Number, min: 50, max: 5000, default: 1000 },
    direction: { type: String, enum: ["long", "short"], default: "long" },
    // Stock account type: "cash" turns on the T+1 settlement check in results
    account: { type: String, enum: ["cash", "margin"], default: "margin" },
    entry: ruleGroup,
    exit: ruleGroup,
    risk: {
      initialCapital: { type: Number, min: 1, max: 1e12, default: 500 },
      positionSizePct: { type: Number, min: 1, max: 100, default: 95 },
      feePct: { type: Number, min: 0, max: 10, default: 0.1 },
      stopLossPct: { type: Number, min: 0, max: 100, default: 0 },
      takeProfitPct: { type: Number, min: 0, max: 1000, default: 0 },
      slippagePct: { type: Number, min: 0, max: 5 }, // unset = 0; left unset so existing rules hash as before
    },
    // Set when the strategy was copied from a marketplace algorithm
    source: {
      algorithm: { type: mongoose.Schema.Types.ObjectId, ref: "Algorithm" },
      version: Number,
    },
    lastBacktest: {
      metrics: { type: mongoose.Schema.Types.Mixed },
      ranAt: Date,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Strategy || mongoose.model("Strategy", strategySchema);
