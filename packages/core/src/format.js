export const money = (n, digits = 0) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: digits, minimumFractionDigits: digits })
    : "—";

export const pct = (n, digits = 2) => (Number.isFinite(n) ? `${n >= 0 ? "" : "−"}${Math.abs(n).toFixed(digits)}%` : "—");

export const num = (n, digits = 2) => {
  if (n === Infinity) return "∞";
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: digits }) : "—";
};

export const price = (n) => {
  if (!Number.isFinite(n)) return "—";
  const d = n >= 1000 ? 2 : n >= 1 ? 4 : 8;
  return n.toLocaleString("en-US", { maximumFractionDigits: d });
};

export const date = (unixSeconds, withTime = false) => {
  if (!unixSeconds) return "—";
  const d = new Date(unixSeconds * 1000);
  // Bar times are UTC (exchange) times; show them in UTC so daily bars don't shift a day
  return withTime
    ? `${d.toLocaleString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })} UTC`
    : d.toLocaleDateString("en-US", { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" });
};

export const ago = (iso) => {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
};

export const signClass = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");
