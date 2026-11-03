import { route } from "@/lib/guard";
import { salesRows } from "@/lib/analytics";
import { pageRows } from "@/lib/paging";
import { db, audit } from "@/lib/store";
import type { Filters } from "@/lib/types";

export const GET = route("sales:view", async ({ scope }, req) => {
  const u = new URL(req.url);
  const f: Filters = JSON.parse(u.searchParams.get("f") || "{}");
  return pageRows(salesRows(scope, f) as unknown as Record<string, unknown>[], u, ["invoice", "customer", "product", "sku", "country", "rep", "category"]);
});

export const DELETE = route("sales:delete", async ({ user, scope }, req) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const row = salesRows(scope).find((r) => r.id === id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  db().sales = db().sales.filter((s) => s.id !== id);
  audit(user, "sales.delete", row.invoice, `${row.sku} ${row.totalEUR} EUR`);
  return { ok: true };
});
