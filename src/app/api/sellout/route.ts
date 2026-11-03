import { route } from "@/lib/guard";
import { outRows } from "@/lib/analytics";
import { pageRows } from "@/lib/paging";
import { audit, db, notify } from "@/lib/store";
import { importSellout } from "@/lib/tabular";
import type { Filters } from "@/lib/types";
import { z } from "zod";

export const GET = route("sellout:view", async ({ scope }, req) => {
  const u = new URL(req.url);
  const f: Filters = JSON.parse(u.searchParams.get("f") || "{}");
  return pageRows(outRows(scope, f) as unknown as Record<string, unknown>[], u, ["customer", "product", "sku", "country", "channel", "source", "category"]);
});

const manual = z.object({
  date: z.string(), customerId: z.string(), sku: z.string(), units: z.coerce.number(), value: z.coerce.number(),
  currency: z.string().optional(), channel: z.string().optional(),
});

/** Manual entry goes through the same validation as file imports. */
export const POST = route("sellout:create", async ({ user, scope }, req) => {
  const b = manual.parse(await req.json());
  const res = importSellout([{ date: b.date, customer: b.customerId, sku: b.sku, units: b.units, value: b.value, currency: b.currency ?? "", channel: b.channel ?? "", source: "Manual entry" }], scope, false, "Manual entry");
  if (res.imported === 0) return Response.json({ error: res.issues.map((i) => i.message).join("; ") || "Validation failed", issues: res.issues }, { status: 422 });
  audit(user, "sellout.create", b.customerId, `${b.sku} x ${b.units}`);
  return { ok: true };
});

export const DELETE = route("sellout:delete", async ({ user, scope }, req) => {
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const row = outRows(scope).find((r) => r.id === id);
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  db().sellout = db().sellout.filter((s) => s.id !== id);
  audit(user, "sellout.delete", row.customer, `${row.sku} ${row.date}`);
  notify({ userId: user.id, type: "quality", title: "Sell-out record deleted", body: `${row.customer} / ${row.sku} (${row.date})`, severity: "info" });
  return { ok: true };
});
