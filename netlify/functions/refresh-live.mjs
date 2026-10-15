// Scheduled function: keeps marketplace live track records current, stalest first.
import { connectDB } from "../../server/db.js";
import { refreshStale } from "../../server/algorithms.js";

export default async () => {
  await connectDB();
  const result = await refreshStale({ budgetMs: 20000, limit: 50 });
  console.log("refresh-live", result);
  return new Response(JSON.stringify({ ok: true, ...result }), { headers: { "Content-Type": "application/json" } });
};

export const config = { schedule: "@hourly" };
