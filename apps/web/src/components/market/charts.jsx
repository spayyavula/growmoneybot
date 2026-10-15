import { fmt, RISK_LABELS, TARGET_VOL_PCT } from "@gmb/core";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Five-segment risk meter, like a fund fact sheet's risk indicator. */
export function RiskMeter({ rating, compact = false }) {
  if (!rating) return <span className="muted small">—</span>;
  return (
    <span className={`risk-meter r${rating} ${compact ? "compact" : ""}`} role="img" aria-label={`Risk ${rating} of 5: ${RISK_LABELS[rating]}`} title={`Risk ${rating}/5 · ${RISK_LABELS[rating]}`}>
      {[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= rating ? "on" : ""} />)}
      {!compact && <span className="risk-label">{RISK_LABELS[rating]}</span>}
    </span>
  );
}

export const riskAdjHint = `Annual return if the strategy were scaled to ${TARGET_VOL_PCT}% volatility (Sharpe ratio × ${TARGET_VOL_PCT}). Lets you compare strategies that take very different amounts of risk.`;

/**
 * Lines rebased to 100 at the start: the algorithm plus buy-and-hold benchmarks.
 * series: [{ key, label, points: [{ time, value }] }]
 */
export function CompareChart({ series, height = 220 }) {
  const lines = series.filter((s) => s.points?.length > 1);
  if (!lines.length) return null;
  const W = 640, H = height, L = 6, R = 46, T = 10, B = 24;
  // Rebase to 100 at each series' starting capital (`base`), so every line starts from the same money
  const rebased = lines.map((s) => {
    const base = s.base || s.points[0].value;
    return { ...s, pts: s.points.map((p) => ({ t: p.time, v: (p.value / base) * 100 })) };
  });
  const all = rebased.flatMap((s) => s.pts);
  const t0 = Math.min(...all.map((p) => p.t)), t1 = Math.max(...all.map((p) => p.t));
  let lo = Math.min(...all.map((p) => p.v)), hi = Math.max(...all.map((p) => p.v));
  const pad = (hi - lo) * 0.06 || 5; lo -= pad; hi += pad;
  const x = (t) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const step = niceStep((hi - lo) / 4);
  const ticks = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticks.push(v);
  const years = [];
  const y0 = new Date(t0 * 1000).getUTCFullYear(), y1 = new Date(t1 * 1000).getUTCFullYear();
  const spanYears = y1 - y0;
  for (let yr = y0 + 1; yr <= y1; yr++) if (spanYears <= 8 || yr % 2 === 0) years.push(yr);
  const monthTicks = spanYears === 0 ? monthsBetween(t0, t1) : [];

  return (
    <figure className="compare-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Growth of 100: algorithm versus buy and hold">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className={`grid ${Math.abs(v - 100) < 1e-9 ? "base" : ""}`} />
            <text x={W - R + 6} y={y(v) + 4} className="tick">{fmt.num(v, 0)}</text>
          </g>
        ))}
        {years.map((yr) => {
          const t = Date.UTC(yr, 0, 1) / 1000;
          return <text key={yr} x={x(t)} y={H - 6} className="tick" textAnchor="middle">{yr}</text>;
        })}
        {monthTicks.map(({ t, label }) => <text key={t} x={x(t)} y={H - 6} className="tick" textAnchor="middle">{label}</text>)}
        {rebased.map((s, i) => (
          <polyline key={s.key} className={`cline c${i}`} fill="none" points={s.pts.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ")} />
        ))}
      </svg>
      <figcaption className="legend">
        {rebased.map((s, i) => {
          const end = s.pts[s.pts.length - 1].v - 100;
          return (
            <span key={s.key} className="legend-item">
              <i className={`swatch c${i}`} />{s.label} <b className={fmt.signClass(end)}>{end > 0 ? "+" : ""}{fmt.pct(end, 1)}</b>
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}

function niceStep(raw) {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
}

function monthsBetween(t0, t1) {
  const out = [];
  const d = new Date(t0 * 1000);
  for (let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); m.getTime() / 1000 <= t1; m.setUTCMonth(m.getUTCMonth() + 1)) {
    out.push({ t: m.getTime() / 1000, label: MONTHS[m.getUTCMonth()] });
  }
  return out.length > 7 ? out.filter((_, i) => i % 2 === 0) : out;
}

/** Calendar of monthly returns with a yearly total, as on a fund fact sheet. */
export function MonthlyGrid({ monthly }) {
  if (!monthly?.length) return null;
  const byYear = new Map();
  for (const { y, m, r } of monthly) {
    if (!byYear.has(y)) byYear.set(y, Array(12).fill(null));
    byYear.get(y)[m - 1] = r;
  }
  const rows = [...byYear.entries()].sort((a, b) => b[0] - a[0]);
  const tone = (r) => (r == null ? "" : r > 0 ? (r >= 5 ? "up2" : "up1") : r < 0 ? (r <= -5 ? "dn2" : "dn1") : "");
  return (
    <div className="monthly-wrap">
      <table className="monthly">
        <thead><tr><th scope="col">Year</th>{MONTHS.map((m) => <th key={m} scope="col">{m}</th>)}<th scope="col">Year</th></tr></thead>
        <tbody>
          {rows.map(([y, ms]) => {
            const yr = (ms.reduce((acc, r) => acc * (1 + (r ?? 0) / 100), 1) - 1) * 100;
            return (
              <tr key={y}>
                <th scope="row">{y}</th>
                {ms.map((r, i) => <td key={i} className={tone(r)}>{r == null ? "" : r.toFixed(1)}</td>)}
                <td className={`total ${tone(yr)}`}>{yr.toFixed(1)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Algorithm curve + its benchmarks, ready for CompareChart. */
export function compareSeries(name, equity, benchmarks = []) {
  return [
    { key: "algo", label: name, points: equity || [], base: equity?.[0]?.value },
    ...benchmarks.map((b) => ({ key: b.key, label: b.label, points: b.equity, base: b.base })),
  ];
}
