import { route } from "@/lib/guard";
import { db } from "@/lib/store";

// Detailed audit logs are restricted to administrators (users:manage_users).
export const GET = route("users:manage_users", async (_ctx, req) => {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").toLowerCase();
  const userId = u.searchParams.get("userId");
  const prefix = u.searchParams.get("action");
  let rows = db().audit;
  if (userId) rows = rows.filter((a) => a.userId === userId);
  if (prefix) rows = rows.filter((a) => a.action.startsWith(prefix));
  if (q) rows = rows.filter((a) => `${a.userName} ${a.action} ${a.target} ${a.detail ?? ""}`.toLowerCase().includes(q));
  const page = Math.max(1, Number(u.searchParams.get("page")) || 1);
  return { total: rows.length, page, rows: rows.slice((page - 1) * 25, page * 25) };
});
