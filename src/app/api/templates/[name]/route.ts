import { route, HttpError } from "@/lib/guard";
import { render, TEMPLATE_OUT, TEMPLATE_SALES } from "@/lib/tabular";

export const GET = route(null, async ({ permissions }, req, { params }: { params: Promise<{ name: string }> }) => {
  const { name } = await params;
  const m = /^(sales|sellout)-template\.(csv|xlsx)$/.exec(name);
  if (!m) throw new HttpError(404, "Unknown template");
  if (!permissions.includes(`${m[1]}:import`) && !permissions.includes("imports:view")) throw new HttpError(403, "Forbidden");
  const [headers, ...rows] = m[1] === "sales" ? TEMPLATE_SALES : TEMPLATE_OUT;
  const out = render(m[2] as "csv" | "xlsx", { title: `${m[1]} template`, headers: headers as string[], rows: rows as (string | number)[][] });
  return new Response(new Uint8Array(out.body), { headers: { "Content-Type": out.type, "Content-Disposition": `attachment; filename="${name}"` } });
});
