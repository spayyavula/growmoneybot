// Scheduled function: keeps marketplace live track records current (and alerts followers
// about new trades). Runs every 15 minutes, two minutes after each quarter hour so the bars
// that just closed (15m, 1h, 4h, 1d, 1w all close on a quarter hour) are available.
import { connectDB } from "../../server/db.js";
import { refreshStale } from "../../server/algorithms.js";

export default async () => {
  await connectDB();
  const result = await refreshStale({ budgetMs: 20000, limit: 50 });
  console.log("refresh-live", result);
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "2,17,32,47 * * * *" };
