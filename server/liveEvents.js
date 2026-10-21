// Which live trading events are new since the last alert. Pure functions (no database), so
// they're unit-tested on their own; server/followerAlerts.js does the delivery.
//
// The watermark (`live.notifiedThrough`) is the key of the newest event already alerted —
// a bar time in unix seconds (see liveEvents in @gmb/core).

const MIN = 60;
// A minute under the 15-minute / hourly cadence so run-to-run jitter never skips a run
const RETRY_SOON = 14 * MIN; // right after a bar should have closed, or after a failed refresh
const RETRY_SLOW = 59 * MIN; // the bar still hasn't appeared after an hour: market closed (weekend, holiday)

/**
 * Whether a live record needs refreshing: only when a new bar should have closed since the
 * last completed bar it saw (`live.lastBarTime`), so nothing is fetched while no new data
 * can exist, and a new bar is picked up by the next 15-minute run after it closes.
 */
export function isLiveDue(live, stepSec, nowSec) {
  const updated = live?.updatedAt ? Math.floor(new Date(live.updatedAt).getTime() / 1000) : null;
  if (!updated || !Number.isFinite(live?.lastBarTime)) return true; // never refreshed, or saved before lastBarTime existed
  const sinceUpdate = nowSec - updated;
  if (live.error) return sinceUpdate >= RETRY_SOON;
  const nextClose = live.lastBarTime + 2 * stepSec; // close time of the bar after the last one seen
  if (nowSec < nextClose) return false;
  if (updated < nextClose) return true; // first look since that bar closed
  // Expected bar is missing (market closed, provider lag): keep checking, every 15 min at first, then hourly
  return sinceUpdate >= (nowSec - nextClose < 60 * MIN ? RETRY_SOON : RETRY_SLOW);
}

/** Where alerting starts when an algorithm has no watermark yet. */
export function initialWatermark(prevLive, sinceSec, stepSec) {
  if (Number.isFinite(prevLive?.notifiedThrough)) return prevLive.notifiedThrough;
  // Tracked before follower alerts existed: anything visible at the last refresh counts as
  // already seen. The newest bar complete at that time opened at least one bar earlier.
  if (prevLive?.updatedAt) return Math.floor(new Date(prevLive.updatedAt).getTime() / 1000) - stepSec;
  // New or just republished: every live event is new
  return sinceSec - 1;
}

/**
 * Split events into those to alert now and the new watermark.
 * Events older than `maxAgeSec` (counted from the triggering bar's close) still move the
 * watermark but aren't sent, so an outage doesn't end in a burst of stale alerts.
 */
export function selectNewEvents(events, { watermark, nowSec, stepSec, maxAgeSec = Math.max(2 * stepSec, 86400) }) {
  let next = watermark;
  const fresh = [];
  for (const e of events || []) {
    if (!(e.key > watermark)) continue;
    next = Math.max(next, e.key);
    if (nowSec - (e.key + stepSec) <= maxAgeSec) fresh.push(e);
  }
  return { fresh, watermark: next };
}

const INTERVAL_LABEL = { "15m": "15m", "1h": "1h", "4h": "4h", "1d": "daily", "1w": "weekly" };

/** Push notification text for one event of a marketplace algorithm. */
export function eventNotification(algo, e, formatPrice = (p) => String(p)) {
  const title = `${e.action.toUpperCase()} · ${algo.symbol} — ${algo.name}`;
  const at = Number.isFinite(e.price) ? ` ${formatPrice(e.price)}` : "";
  const bar = INTERVAL_LABEL[algo.interval] || algo.interval;
  let body;
  if (e.type === "entry") {
    body = e.pending
      ? `Entry signal on the ${bar} close at${at}. The algorithm enters at the next open.`
      : `Entered${e.price != null ? ` at${at}` : ""} (${bar}).`;
  } else if (e.reason === "stop loss" || e.reason === "take profit") {
    body = `${e.reason === "stop loss" ? "Stop loss" : "Take profit"} hit at${at}${Number.isFinite(e.pnlPct) ? ` (${e.pnlPct >= 0 ? "+" : ""}${e.pnlPct.toFixed(2)}%)` : ""}.`;
  } else {
    body = e.pending
      ? `Exit signal on the ${bar} close at${at}. The algorithm exits at the next open.`
      : `Exited at${at}${Number.isFinite(e.pnlPct) ? ` (${e.pnlPct >= 0 ? "+" : ""}${e.pnlPct.toFixed(2)}%)` : ""}.`;
  }
  return { title: title.slice(0, 120), body: `${body} Not investment advice.` };
}
