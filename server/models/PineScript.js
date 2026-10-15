import mongoose from "mongoose";

const pineScriptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    code: { type: String, required: true, maxlength: 100_000 },
  },
  { timestamps: true }
);

export default mongoose.models.PineScript || mongoose.model("PineScript", pineScriptSchema);
