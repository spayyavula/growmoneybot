import mongoose from "mongoose";

const { Mixed, ObjectId } = mongoose.Schema.Types;

// A verified result: what the server measured on data it fetched itself
const verificationSchema = new mongoose.Schema({
  engine: String,
  specHash: String,
  dataHash: String,
  receiptHash: String,
  metrics: Mixed,
  equity: Mixed, // [{ time, value }] downsampled for charts
  trades: Mixed, // every closed trade (slim)
  openTrade: Mixed,
  from: Number,
  to: Number,
  bars: Number,
  verifiedAt: Date,
}, { _id: false });

// Forward performance since the publish date, refreshed from fresh market data
const liveSchema = new mongoose.Schema({
  since: Date,
  started: { type: Boolean, default: false },
  metrics: Mixed,
  equity: Mixed,
  trades: Mixed,
  openTrade: Mixed,
  bars: Number,
  updatedAt: Date,
  error: String,
}, { _id: false });

const algorithmSchema = new mongoose.Schema(
  {
    author: { type: ObjectId, ref: "User", required: true, index: true },
    strategy: { type: ObjectId, ref: "Strategy" }, // the author's working copy it was published from
    name: { type: String, required: true, trim: true, maxlength: 80 },
    summary: { type: String, required: [true, "Add a one-line summary"], trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 3000, default: "" },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ["published", "unlisted", "removed"], default: "published", index: true },
    removedReason: { type: String, maxlength: 500 },

    // Frozen rules for the current version. Only followers, the author and admins can read them.
    version: { type: Number, default: 1 },
    publishedAt: { type: Date, default: Date.now }, // current version's publish date = live tracking start
    spec: { type: Mixed, required: true },
    market: { type: String, index: true },
    symbol: { type: String, index: true },
    interval: String,
    direction: String,

    verification: verificationSchema,
    live: liveSchema,

    // Earlier versions stay on record so a track record can't be quietly reset
    history: {
      type: [{
        version: Number, publishedAt: Date, retiredAt: Date, specHash: String, dataHash: String,
        receiptHash: String, verifiedMetrics: Mixed, liveMetrics: Mixed, _id: false,
      }],
      default: [],
    },

    followers: { type: Number, default: 0 },
    copies: { type: Number, default: 0 },
  },
  { timestamps: true }
);

algorithmSchema.index({ status: 1, "live.updatedAt": 1 });

export default mongoose.models.Algorithm || mongoose.model("Algorithm", algorithmSchema);
