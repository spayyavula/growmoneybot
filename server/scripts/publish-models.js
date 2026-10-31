// Verify and publish the house model set to the marketplace.
//   node server/scripts/publish-models.js            dry run: verify on live data, print the results
//   node server/scripts/publish-models.js --publish  also write them to MONGODB_URI under the house expert
// Re-running with --publish updates existing listings (same name) to a new version only if the rules changed.
import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { connectDB } from "../db.js";
import { snapshot, saveDataset, PublishError } from "../algorithms.js";
import Algorithm from "../models/Algorithm.js";
import Strategy from "../models/Strategy.js";
import User from "../models/User.js";
import { MODELS, toStrategy } from "./models.js";

const HOUSE_EMAIL = process.env.HOUSE_EXPERT_EMAIL || "research@growmoneybot.com";
const publish = process.argv.includes("--publish");

const fmt = (v, d = 1) => (v == null || !Number.isFinite(v) ? "—" : v.toFixed(d));

async function houseExpert() {
  let user = await User.findOne({ email: HOUSE_EMAIL });
  if (!user) {
    // Nobody signs in as this account: the password is random and never stored anywhere
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10);
    user = await User.create({ email: HOUSE_EMAIL, name: "GrowMoneyBot Research", passwordHash });
  }
  user.expert = {
    ...(user.expert?.toObject?.() ?? {}),
    status: "approved", displayName: "GrowMoneyBot Research", markets: ["crypto", "stocks"],
    bio: "The GrowMoneyBot team's reference set of classic technical trading models, verified by the server on real market data. Educational starting points, not investment advice.",
    reviewedAt: new Date(),
  };
  await user.save();
  return user;
}

async function publishOne(user, model, snap) {
  const strategyFields = toStrategy(model);
  const strategy = await Strategy.findOneAndUpdate(
    { user: user._id, name: model.name }, { $set: { ...strategyFields, user: user._id } }, { upsert: true, new: true }
  );
  const listing = { name: model.name, summary: model.summary, description: model.description ?? "", tags: model.tags };
  const existing = await Algorithm.findOne({ author: user._id, name: model.name });

  if (!existing) {
    const algo = await Algorithm.create({
      author: user._id, strategy: strategy._id, ...listing, ...snap.fields,
      version: 1, publishedAt: new Date(), live: { since: new Date(), started: false },
    });
    await saveDataset(algo._id, 1, snap.fields.verification.dataHash, snap.rows);
    return "created";
  }
  Object.assign(existing, listing, { status: "published" });
  if (existing.verification?.specHash === snap.fields.verification.specHash) {
    await existing.save();
    return "unchanged rules";
  }
  // Rules changed: retire the current version and restart live tracking, like a republish
  existing.history.push({
    version: existing.version, publishedAt: existing.publishedAt, retiredAt: new Date(),
    specHash: existing.verification?.specHash, dataHash: existing.verification?.dataHash,
    receiptHash: existing.verification?.receiptHash, verifiedMetrics: existing.verification?.metrics, liveMetrics: existing.live?.metrics,
  });
  Object.assign(existing, snap.fields, { version: existing.version + 1, publishedAt: new Date(), live: { since: new Date(), started: false } });
  await existing.save();
  await saveDataset(existing._id, existing.version, snap.fields.verification.dataHash, snap.rows);
  return `new version ${existing.version}`;
}

const results = [];
for (const model of MODELS) {
  try {
    const snap = await snapshot(toStrategy(model));
    results.push({ model, snap });
    process.stderr.write(`✓ ${model.name}\n`);
  } catch (err) {
    results.push({ model, error: err instanceof PublishError ? err.message : String(err.message || err) });
    process.stderr.write(`✗ ${model.name}: ${err.message}\n`);
  }
}

const ok = results.filter((r) => r.snap).sort((a, b) => b.snap.fields.verification.metrics.totalReturnPct - a.snap.fields.verification.metrics.totalReturnPct);
console.log("\n# | Model | Period | Return % | Buy&Hold % | CAGR % | Max DD % | Trades | Win % | PF | Sharpe");
ok.forEach(({ model, snap }, i) => {
  const v = snap.fields.verification, m = v.metrics;
  const period = `${new Date(v.from * 1000).toISOString().slice(0, 10)}→${new Date(v.to * 1000).toISOString().slice(0, 10)}`;
  console.log([i + 1, model.name, period, fmt(m.totalReturnPct), fmt(m.buyHoldPct), fmt(m.cagrPct), fmt(m.maxDrawdownPct),
    m.totalTrades, fmt(m.winRatePct), fmt(m.profitFactor, 2), fmt(m.sharpe, 2)].join(" | "));
});
for (const r of results.filter((r) => r.error)) console.log(`FAILED: ${r.model.name} — ${r.error}`);

if (publish) {
  await connectDB();
  const user = await houseExpert();
  for (const { model, snap } of ok) console.log(`${model.name}: ${await publishOne(user, model, snap)}`);
}
process.exit(0);
