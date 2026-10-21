import { Router } from "express";
import mongoose from "mongoose";
import Algorithm from "../models/Algorithm.js";
import AlgoDataset from "../models/AlgoDataset.js";
import Follow from "../models/Follow.js";
import Strategy from "../models/Strategy.js";
import User from "../models/User.js";
import { connectDB } from "../db.js";
import { requireAuth, optionalAuth, isAdminEmail, wrap } from "../auth.js";
import { HttpError } from "../marketData.js";
import { snapshot, saveDataset, refreshLive, isLiveStale, cardView, detailView, PublishError } from "../algorithms.js";

// Marketplace of verified algorithms from approved experts.
//  Public: browse, view results. Followers: see rules, copy, re-check the verification.
const router = Router();
router.use(optionalAuth);

const MAX_PUBLISHED_PER_EXPERT = 20;
const AUTHOR_FIELDS = "name expert";
const validId = (id) => mongoose.isValidObjectId(id);
const notFound = (res) => res.status(404).json({ ok: false, error: "Algorithm not found" });
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function cleanListing(body = {}) {
  const out = {};
  if (typeof body.summary === "string") out.summary = body.summary.trim().slice(0, 160);
  if (typeof body.description === "string") out.description = body.description.trim().slice(0, 3000);
  if (typeof body.name === "string" && body.name.trim()) out.name = body.name.trim().slice(0, 80);
  if (Array.isArray(body.tags))
    out.tags = [...new Set(body.tags.map((t) => String(t).trim().toLowerCase().replace(/[^a-z0-9 \-]/g, "").slice(0, 24)).filter(Boolean))].slice(0, 5);
  return out;
}

// Map provider/verification failures to clear API errors
function sendError(res, err) {
  if (err instanceof PublishError || err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message });
  if (err.name === "TimeoutError") return res.status(504).json({ ok: false, error: "The market data provider timed out. Try again in a minute." });
  throw err;
}

async function viewer(req) {
  if (!req.userId) return { user: null, isAdmin: false };
  const user = await User.findById(req.userId);
  return { user, isAdmin: isAdminEmail(user?.email) };
}

async function accessFor(req, algo) {
  const { user, isAdmin } = await viewer(req);
  const isAuthor = !!user && String(algo.author?._id ?? algo.author) === String(user._id);
  const follow = user ? await Follow.findOne({ user: user._id, algorithm: algo._id }).select("notify").lean() : null;
  const following = !!follow;
  return { user, isAdmin, isAuthor, following, notify: following && follow.notify !== false, canSeeRules: isAuthor || isAdmin || following };
}

// ---- Browse --------------------------------------------------------------

router.get("/", wrap(async (req, res) => {
  await connectDB();
  const filter = { status: "published" };
  if (["crypto", "stocks"].includes(req.query.market)) filter.market = req.query.market;
  const q = String(req.query.q || "").trim().slice(0, 60);
  if (q) {
    const re = new RegExp(escapeRe(q), "i");
    filter.$or = [{ name: re }, { summary: re }, { symbol: re }, { tags: q.toLowerCase() }];
  }
  const sorts = {
    live: { "live.metrics.totalReturnPct": -1, followers: -1 },
    verified: { "verification.metrics.totalReturnPct": -1 },
    followers: { followers: -1, publishedAt: -1 },
    new: { publishedAt: -1 },
  };
  const sort = sorts[req.query.sort] || sorts.followers;
  const items = await Algorithm.find(filter).sort(sort).limit(60).populate("author", AUTHOR_FIELDS);
  res.json({ ok: true, algorithms: items.map(cardView) });
}));

router.get("/following", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const follows = await Follow.find({ user: req.userId }).sort({ createdAt: -1 }).limit(200).lean();
  const items = await Algorithm.find({ _id: { $in: follows.map((f) => f.algorithm) }, status: { $ne: "removed" } }).populate("author", AUTHOR_FIELDS);
  res.json({ ok: true, algorithms: items.map(cardView) });
}));

router.get("/mine", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const items = await Algorithm.find({ author: req.userId }).sort({ updatedAt: -1 }).populate("author", AUTHOR_FIELDS);
  res.json({ ok: true, algorithms: items.map((a) => ({ ...cardView(a), removedReason: a.removedReason, strategy: a.strategy })) });
}));

// ---- Publish (approved experts) -----------------------------------------

async function requireExpert(req, res) {
  const user = await User.findById(req.userId);
  if (!user) { res.status(401).json({ ok: false, error: "Account not found" }); return null; }
  if (user.expert?.status !== "approved") { res.status(403).json({ ok: false, error: "Only approved experts can publish. Apply to the expert program first." }); return null; }
  return user;
}

router.post("/", requireAuth, wrap(async (req, res) => {
  await connectDB();
  const user = await requireExpert(req, res);
  if (!user) return;
  const strategyId = req.body?.strategyId;
  if (!validId(strategyId)) return res.status(400).json({ ok: false, error: "Choose one of your strategies to publish" });
  const strategy = await Strategy.findOne({ _id: strategyId, user: user._id }).lean();
  if (!strategy) return res.status(404).json({ ok: false, error: "Strategy not found" });
  if (await Algorithm.countDocuments({ author: user._id, status: { $ne: "removed" } }) >= MAX_PUBLISHED_PER_EXPERT)
    return res.status(400).json({ ok: false, error: `You can have up to ${MAX_PUBLISHED_PER_EXPERT} algorithms in the marketplace` });
  const listing = cleanListing(req.body);
  if (!listing.summary) return res.status(400).json({ ok: false, error: "Add a one-line summary" });

  let snap;
  try { snap = await snapshot(strategy); } catch (err) { return sendError(res, err); }

  const algo = await Algorithm.create({
    author: user._id, strategy: strategy._id, name: listing.name || strategy.name, summary: listing.summary,
    description: listing.description ?? "", tags: listing.tags ?? [], ...snap.fields,
    version: 1, publishedAt: new Date(), live: { since: new Date(), started: false },
  });
  await saveDataset(algo._id, 1, snap.fields.verification.dataHash, snap.rows);
  await algo.populate("author", AUTHOR_FIELDS);
  res.status(201).json({ ok: true, algorithm: detailView(algo, { canSeeRules: true, isAuthor: true }) });
}));

// ---- One algorithm -------------------------------------------------------

router.get("/:id", wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  let algo = await Algorithm.findById(req.params.id).populate("author", AUTHOR_FIELDS);
  if (!algo) return notFound(res);
  const access = await accessFor(req, algo);
  // Unlisted: still reachable by link for its followers and author; removed: author and admins only
  if (algo.status === "removed" && !access.isAuthor && !access.isAdmin) return notFound(res);
  if (algo.status === "unlisted" && !access.isAuthor && !access.isAdmin && !access.following) return notFound(res);

  if (algo.status === "published" && isLiveStale(algo)) {
    // Bring the live record up to date, but don't hold the page for a slow data provider
    await Promise.race([refreshLive(algo).catch(() => {}), new Promise((r) => setTimeout(r, 6000))]);
  }
  res.json({ ok: true, algorithm: detailView(algo, access) });
}));

router.put("/:id", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  const algo = await Algorithm.findOne({ _id: req.params.id, author: req.userId });
  if (!algo) return notFound(res);
  Object.assign(algo, cleanListing(req.body));
  if (["published", "unlisted"].includes(req.body?.status)) {
    if (algo.status === "removed") return res.status(403).json({ ok: false, error: "This algorithm was removed by GrowMoneyBot and can't be relisted" });
    algo.status = req.body.status;
  }
  await algo.save();
  await algo.populate("author", AUTHOR_FIELDS);
  res.json({ ok: true, algorithm: detailView(algo, { canSeeRules: true, isAuthor: true }) });
}));

// Publish a new version from the source strategy. The old version's record is kept in history
// and live tracking restarts, so changed rules can't inherit an earlier track record.
router.post("/:id/republish", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  const user = await requireExpert(req, res);
  if (!user) return;
  const algo = await Algorithm.findOne({ _id: req.params.id, author: user._id });
  if (!algo) return notFound(res);
  if (algo.status === "removed") return res.status(403).json({ ok: false, error: "This algorithm was removed by GrowMoneyBot" });
  const strategy = await Strategy.findOne({ _id: algo.strategy, user: user._id }).lean();
  if (!strategy) return res.status(404).json({ ok: false, error: "The strategy this was published from no longer exists" });

  let snap;
  try { snap = await snapshot(strategy); } catch (err) { return sendError(res, err); }
  if (snap.fields.verification.specHash === algo.verification?.specHash)
    return res.status(400).json({ ok: false, error: "The rules haven't changed since this version was published" });

  algo.history.push({
    version: algo.version, publishedAt: algo.publishedAt, retiredAt: new Date(),
    specHash: algo.verification?.specHash, dataHash: algo.verification?.dataHash, receiptHash: algo.verification?.receiptHash,
    verifiedMetrics: algo.verification?.metrics, liveMetrics: algo.live?.metrics ?? null,
  });
  Object.assign(algo, snap.fields, cleanListing(req.body));
  algo.version += 1;
  algo.publishedAt = new Date();
  algo.live = { since: algo.publishedAt, started: false };
  await algo.save();
  await saveDataset(algo._id, algo.version, snap.fields.verification.dataHash, snap.rows);
  await algo.populate("author", AUTHOR_FIELDS);
  res.json({ ok: true, algorithm: detailView(algo, { canSeeRules: true, isAuthor: true }) });
}));

router.post("/:id/follow", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  const algo = await Algorithm.findOne({ _id: req.params.id, status: "published" });
  if (!algo) return notFound(res);
  try {
    await Follow.create({ user: req.userId, algorithm: algo._id });
    await Algorithm.updateOne({ _id: algo._id }, { $inc: { followers: 1 } });
  } catch (err) {
    if (err.code !== 11000) throw err; // already following
  }
  res.json({ ok: true, following: true, notify: true });
}));

// Turn trade alerts for one followed algorithm on or off
router.put("/:id/follow", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  if (typeof req.body?.notify !== "boolean") return res.status(400).json({ ok: false, error: "notify must be true or false" });
  await connectDB();
  const follow = await Follow.findOneAndUpdate(
    { user: req.userId, algorithm: req.params.id }, { $set: { notify: req.body.notify } }, { new: true }
  ).lean();
  if (!follow) return res.status(404).json({ ok: false, error: "You don't follow this algorithm" });
  res.json({ ok: true, following: true, notify: follow.notify });
}));

router.delete("/:id/follow", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  const r = await Follow.deleteOne({ user: req.userId, algorithm: req.params.id });
  if (r.deletedCount) await Algorithm.updateOne({ _id: req.params.id, followers: { $gt: 0 } }, { $inc: { followers: -1 } });
  res.json({ ok: true, following: false });
}));

// Copy the current version's rules into the follower's own strategies
router.post("/:id/copy", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  const algo = await Algorithm.findById(req.params.id).populate("author", AUTHOR_FIELDS);
  if (!algo || algo.status === "removed") return notFound(res);
  const access = await accessFor(req, algo);
  if (!access.canSeeRules) return res.status(403).json({ ok: false, error: "Follow this algorithm to copy its rules" });
  if (await Strategy.countDocuments({ user: req.userId }) >= 200) return res.status(400).json({ ok: false, error: "Strategy limit reached (200)" });
  const by = algo.author?.expert?.displayName || "an expert";
  const strategy = await Strategy.create({
    ...algo.spec, user: req.userId, name: `${algo.name} (copy)`.slice(0, 80),
    description: `Copied from "${algo.name}" v${algo.version} by ${by} on the GrowMoneyBot marketplace.`,
    source: { algorithm: algo._id, version: algo.version },
  });
  if (!access.isAuthor) await Algorithm.updateOne({ _id: algo._id }, { $inc: { copies: 1 } });
  res.status(201).json({ ok: true, strategy });
}));

// The frozen dataset, so followers can re-run the verification in their own browser
router.get("/:id/dataset", requireAuth, wrap(async (req, res) => {
  if (!validId(req.params.id)) return notFound(res);
  await connectDB();
  const algo = await Algorithm.findById(req.params.id);
  if (!algo || algo.status === "removed") return notFound(res);
  const access = await accessFor(req, algo);
  if (!access.canSeeRules) return res.status(403).json({ ok: false, error: "Follow this algorithm to re-check its verification" });
  const ds = await AlgoDataset.findOne({ algorithm: algo._id, version: algo.version }).lean();
  if (!ds) return res.status(404).json({ ok: false, error: "Dataset not found" });
  res.set("Cache-Control", "private, max-age=3600");
  const rows = [];
  for (let i = 0; i < ds.flat.length; i += 6) rows.push(ds.flat.slice(i, i + 6));
  res.json({ ok: true, version: ds.version, dataHash: ds.dataHash, rows });
}));

export default router;
