import mongoose from "mongoose";

const followSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    algorithm: { type: mongoose.Schema.Types.ObjectId, ref: "Algorithm", required: true, index: true },
    // Alert this follower when the algorithm enters or exits a trade
    notify: { type: Boolean, default: true },
  },
  { timestamps: true }
);
followSchema.index({ user: 1, algorithm: 1 }, { unique: true });

export default mongoose.models.Follow || mongoose.model("Follow", followSchema);
