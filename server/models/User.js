import mongoose from "mongoose";
import crypto from "node:crypto";

export const newWebhookToken = () => crypto.randomBytes(24).toString("hex");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email"],
    },
    passwordHash: { type: String, required: true, select: false },
    // Secret used in the TradingView webhook URL: /api/webhooks/tv/<token>
    webhookToken: { type: String, unique: true, index: true, default: newWebhookToken },
    // Expo push tokens for the user's phones (mobile app)
    devices: {
      type: [{
        token: { type: String, required: true, maxlength: 200 },
        platform: { type: String, enum: ["ios", "android", "web"], default: "ios" },
        name: { type: String, maxlength: 80 },
        addedAt: { type: Date, default: Date.now },
      }],
      default: [],
      select: false,
    },
    notifyOnSignals: { type: Boolean, default: true },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  return {
    id: this._id, name: this.name, email: this.email, webhookToken: this.webhookToken,
    notifyOnSignals: this.notifyOnSignals !== false, createdAt: this.createdAt,
  };
};

export default mongoose.models.User || mongoose.model("User", userSchema);
