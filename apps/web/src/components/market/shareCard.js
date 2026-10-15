// Draws a 1200×630 share image (the standard social preview size) for an algorithm.
// Always light so it looks the same wherever it's posted.
import { fmt, RISK_LABELS, TARGET_VOL_PCT } from "@gmb/core";

const C = { bg: "#f5f5f7", card: "#ffffff", ink: "#1d1d1f", muted: "#6e6e73", green: "#1a8c46", red: "#d70015", line: "#e5e5ea", seal: "#34c759", bench: "#8e8e93" };
const FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", Inter, "Segoe UI", system-ui, sans-serif';

const signed = (v, d = 1) => (Number.isFinite(v) ? `${v > 0 ? "+" : ""}${fmt.pct(v, d)}` : "—");
const tone = (v) => (v > 0 ? C.green : v < 0 ? C.red : C.ink);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function fitText(ctx, text, max) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

// Values rebased to 1 at the start, or null if there's nothing to draw
const rebase = (points, base) => (points?.length > 1 ? points.map((p) => p.value / (base || points[0].value)) : null);

export async function drawShareCard(a, url) {
  const W = 1200, H = 630;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  const v = a.verification || {}, m = v.metrics || {}, risk = v.risk || {};
  const live = a.live || {}, lm = live.metrics;

  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = C.card; roundRect(ctx, 40, 40, W - 80, H - 80, 36); ctx.fill();

  // Header
  ctx.fillStyle = C.seal; roundRect(ctx, 80, 80, 44, 44, 12); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = `700 26px ${FONT}`; ctx.fillText("✓", 91, 111);
  ctx.fillStyle = C.ink; ctx.font = `600 26px ${FONT}`; ctx.fillText("GrowMoneyBot", 138, 112);
  ctx.fillStyle = C.green; ctx.font = `600 22px ${FONT}`;
  const tag = "Verified results";
  ctx.fillText(tag, W - 80 - ctx.measureText(tag).width, 110);

  // Title
  ctx.fillStyle = C.ink; ctx.font = `700 58px ${FONT}`;
  ctx.fillText(fitText(ctx, a.name, W - 160), 80, 200);
  ctx.fillStyle = C.muted; ctx.font = `400 26px ${FONT}`;
  ctx.fillText(fitText(ctx, `by ${a.author?.displayName ?? "an expert"} · ${a.symbol} · v${a.version}`, W - 160), 80, 242);

  // Numbers
  const stats = [
    [`Live since ${fmt.date(Math.floor(new Date(live.since || a.publishedAt).getTime() / 1000))}`, live.started && lm ? lm.totalReturnPct : null],
    ["Verified backtest", m.totalReturnPct],
    [`At ${TARGET_VOL_PCT}% volatility`, risk.riskAdjReturnPct],
  ];
  stats.forEach(([label, val], i) => {
    const x = 80 + i * 250;
    ctx.fillStyle = C.muted; ctx.font = `500 20px ${FONT}`; ctx.fillText(label, x, 312);
    ctx.fillStyle = val == null ? C.muted : tone(val); ctx.font = `700 52px ${FONT}`;
    ctx.fillText(val == null ? "—" : signed(val), x, 370);
  });
  ctx.fillStyle = C.muted; ctx.font = `500 20px ${FONT}`; ctx.fillText("Risk", 830, 312);
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < (risk.rating || 0) ? ["#34c759", "#7ac943", "#ff9f0a", "#ff6b3d", "#ff3b30"][risk.rating - 1] : C.line;
    roundRect(ctx, 830 + i * 30, 336, 24, 30, 6); ctx.fill();
  }
  ctx.fillStyle = C.ink; ctx.font = `600 22px ${FONT}`; ctx.fillText(RISK_LABELS[risk.rating] || "", 990, 360);

  // Chart: algorithm vs. hold, rebased
  const box = { x: 80, y: 410, w: W - 160, h: 120 };
  const hold = (v.benchmarks || []).find((b) => b.key === "hold");
  const series = [rebase(v.equity), rebase(hold?.equity, hold?.base)];
  const all = series.filter(Boolean).flat();
  if (all.length) {
    const lo = Math.min(...all), hi = Math.max(...all);
    const draw = (vals, color, width, dash = []) => {
      if (!vals) return;
      ctx.beginPath(); ctx.setLineDash(dash); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round";
      vals.forEach((val, i) => {
        const x = box.x + (i / (vals.length - 1)) * box.w;
        const y = box.y + (1 - (val - lo) / (hi - lo || 1)) * box.h;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.stroke(); ctx.setLineDash([]);
    };
    draw(series[1], C.bench, 3, [8, 8]);
    draw(series[0], C.green, 5);
  }
  ctx.fillStyle = C.muted; ctx.font = `400 19px ${FONT}`;
  const caption = `Backtest vs. holding ${a.symbol} (dashed) · ${fmt.date(v.from)} – ${fmt.date(v.to)}`;
  ctx.fillText(caption, 80, 560);
  // The link takes whatever room is left on the right, shortened if needed
  const room = W - 160 - ctx.measureText(caption).width - 32;
  const host = fitText(ctx, url.replace(/^https?:\/\//, ""), Math.max(120, room));
  ctx.fillStyle = C.green; ctx.font = `600 19px ${FONT}`;
  ctx.fillText(host, W - 80 - ctx.measureText(host).width, 560);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't create the image"))), "image/png"));
}
