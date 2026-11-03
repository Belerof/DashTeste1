import { route, HttpError } from "@/lib/guard";
import { targetsView } from "@/lib/analytics";
import { audit, db, nextId } from "@/lib/store";
import { z } from "zod";

export const GET = route("sales:view", async ({ scope }, req) => {
  const u = new URL(req.url);
  const year = Number(u.searchParams.get("year")) || new Date().getFullYear();
  const kind = (u.searchParams.get("kind") || "country") as "country" | "customer" | "rep";
  if (!["country", "customer", "rep"].includes(kind)) throw new HttpError(400, "Invalid kind");
  return { year, kind, rows: targetsView(scope, year, kind) };
});

const put = z.object({ kind: z.enum(["country", "customer", "rep"]), refId: z.string(), year: z.number().int(), month: z.number().int().min(1).max(12).nullable(), amountEUR: z.number().min(0).max(1e10) });

/** Only administrators who may configure data/settings can change targets. */
export const PUT = route("settings:edit", async ({ user, scope }, req) => {
  const b = put.parse(await req.json());
  if (b.kind === "country" && scope.countries.length && !scope.countries.includes(b.refId)) throw new HttpError(403, "Outside your data access");
  const t = db().targets.find((x) => x.scope === b.kind && x.refId === b.refId && x.year === b.year && x.month === b.month);
  const before = t?.amountEUR ?? 0;
  if (t) t.amountEUR = b.amountEUR; else db().targets.push({ id: nextId("T"), scope: b.kind, refId: b.refId, year: b.year, month: b.month, amountEUR: b.amountEUR });
  audit(user, "target.update", `${b.kind}:${b.refId}`, `${b.year}${b.month ? "-" + b.month : ""}: ${before} -> ${b.amountEUR}`);
  return { ok: true };
});
