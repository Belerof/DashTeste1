import { route, HttpError } from "@/lib/guard";
import { outRows, salesRows } from "@/lib/analytics";
import { REPORTS, reportTable } from "@/lib/reports";
import { audit } from "@/lib/store";
import { outTable, render, salesTable } from "@/lib/tabular";
import { z } from "zod";

const body = z.object({ dataset: z.enum(["sales", "sellout", "report"]), report: z.string().optional(), format: z.enum(["csv", "xlsx", "pdf"]), filters: z.record(z.string(), z.any()).default({}) });

export const POST = route(null, async ({ user, scope, permissions }, req) => {
  const b = body.parse(await req.json());
  const need = b.dataset === "report" ? REPORTS.find((r) => r.key === b.report)?.perm : `${b.dataset}:view`;
  if (!need) throw new HttpError(400, "Unknown report");
  const exportPerm = b.dataset === "report" ? "reports:export" : `${b.dataset}:export`;
  for (const p of [need, exportPerm]) if (!permissions.includes(p)) throw new HttpError(403, `Forbidden: missing permission ${p}`);
  const table = b.dataset === "sales" ? salesTable(salesRows(scope, b.filters)) : b.dataset === "sellout" ? outTable(outRows(scope, b.filters)) : reportTable(b.report!, scope, b.filters);
  if (!table) throw new HttpError(400, "Unknown report");
  const out = render(b.format, table);
  audit(user, "data.export", `${b.dataset}${b.report ? ":" + b.report : ""}`, `${b.format}, ${table.rows.length} rows`);
  const name = `${b.report ?? b.dataset}-${new Date().toISOString().slice(0, 10)}.${out.ext}`;
  return new Response(new Uint8Array(out.body), { headers: { "Content-Type": out.type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" } });
});
