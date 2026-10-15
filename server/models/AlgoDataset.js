import mongoose from "mongoose";

// The exact OHLCV dataset a verification ran on, kept so followers can re-run it and
// check it against the receipt. Stored flat (6 numbers per bar: time, open, high, low, close, volume)
// for compactness; the API returns it as rows.
const algoDatasetSchema = new mongoose.Schema(
  {
    algorithm: { type: mongoose.Schema.Types.ObjectId, ref: "Algorithm", required: true },
    version: { type: Number, required: true },
    dataHash: { type: String, required: true },
    flat: { type: [Number], required: true },
  },
  { timestamps: true }
);
algoDatasetSchema.index({ algorithm: 1, version: 1 }, { unique: true });

export default mongoose.models.AlgoDataset || mongoose.model("AlgoDataset", algoDatasetSchema);
