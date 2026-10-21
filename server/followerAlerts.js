// Alert followers when a marketplace algorithm enters or exits a trade: a Signal on their
// Alerts page, plus a push notification to their phones if notifications are on.
import { fmt } from "@gmb/core";
import Follow from "./models/Follow.js";
import Signal from "./models/Signal.js";
import User from "./models/User.js";
import { sendPush } from "./push.js";
import { eventNotification } from "./liveEvents.js";

const PUSH_BATCH = 100; // Expo accepts up to 100 messages per request
const MAX_EVENTS_PER_RUN = 3; // if several arrive at once, alert the newest few

export async function alertFollowers(algo, events) {
  const list = (events || []).slice(-MAX_EVENTS_PER_RUN);
  if (!list.length) return { followers: 0, alerts: 0, pushed: 0 };

  const follows = await Follow.find({ algorithm: algo._id, notify: { $ne: false } }).select("user").lean();
  if (!follows.length) return { followers: 0, alerts: 0, pushed: 0 };
  const userIds = follows.map((f) => f.user);

  const notes = list.map((e) => eventNotification(algo, e, fmt.price));
  await Signal.insertMany(
    list.flatMap((e, i) => userIds.map((user) => ({
      user, source: "marketplace", algorithm: algo._id, algorithmName: algo.name, algorithmVersion: algo.version,
      type: e.type, action: e.action, ticker: algo.symbol, interval: algo.interval,
      price: Number.isFinite(e.price) ? e.price : undefined, pending: e.pending, reason: e.reason,
      pnlPct: Number.isFinite(e.pnlPct) ? e.pnlPct : undefined, message: notes[i].body,
    }))),
    { ordered: false }
  );

  const users = await User.find({ _id: { $in: userIds }, notifyOnSignals: { $ne: false } }).select("_id devices").lean();
  const tokens = users.flatMap((u) => (u.devices || []).map((d) => d.token));
  let pushed = 0;
  const dead = new Set();
  for (let i = 0; i < list.length; i++) {
    const data = { url: "/alerts", algorithmId: String(algo._id) };
    const batches = [];
    for (let j = 0; j < tokens.length; j += PUSH_BATCH) batches.push(tokens.slice(j, j + PUSH_BATCH));
    const results = await Promise.all(batches.map((b) => sendPush(b, { ...notes[i], data })));
    results.forEach((r) => r.dead.forEach((t) => dead.add(t)));
    pushed += tokens.length;
  }
  if (dead.size) await User.updateMany({ _id: { $in: userIds } }, { $pull: { devices: { token: { $in: [...dead] } } } });

  return { followers: userIds.length, alerts: list.length, pushed };
}
