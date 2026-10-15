import mongoose from "mongoose";
import crypto from "node:crypto";
import { isAdminEmail } from "../auth.js";

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
    // Expert program: traders apply, an admin approves, then they can publish to the marketplace
    expert: {
      status: { type: String, enum: ["none", "pending", "approved", "rejected", "revoked"], default: "none", index: true },
      displayName: { type: String, trim: true, maxlength: 60 },
      bio: { type: String, trim: true, maxlength: 1200 },
      experience: { type: String, trim: true, maxlength: 1200 },
      markets: { type: [String], default: [] },
      links: {
        website: { type: String, trim: true, maxlength: 200 },
        x: { type: String, trim: true, maxlength: 200 },
        tradingview: { type: String, trim: true, maxlength: 200 },
      },
      appliedAt: Date,
      reviewedAt: Date,
      reviewNote: { type: String, trim: true, maxlength: 500 },
    },
  },
  { timestamps: true }
);

userSchema.methods.toPublic = function () {
  return {
    id: this._id, name: this.name, email: this.email, webhookToken: this.webhookToken,
    notifyOnSignals: this.notifyOnSignals !== false, createdAt: this.createdAt,
    isAdmin: isAdminEmail(this.email),
    expert: this.expertProfile(true),
  };
};

// Expert profile; `self` adds the review fields only the expert (and admins) should see
userSchema.methods.expertProfile = function (self = false) {
  const e = this.expert || {};
  const out = {
    status: e.status || "none", displayName: e.displayName || "", bio: e.bio || "", markets: e.markets || [],
    links: { website: e.links?.website || "", x: e.links?.x || "", tradingview: e.links?.tradingview || "" },
  };
  if (self) Object.assign(out, { experience: e.experience || "", appliedAt: e.appliedAt, reviewedAt: e.reviewedAt, reviewNote: e.reviewNote || "" });
  return out;
};

export default mongoose.models.User || mongoose.model("User", userSchema);
