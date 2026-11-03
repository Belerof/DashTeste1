import { route, HttpError } from "@/lib/guard";
import { buildAnalytics } from "@/lib/analytics";
import { z } from "zod";

const body = z.object({ filters: z.record(z.string(), z.any()).default({}), compare: z.enum(["prev", "yoy"]).default("yoy") });

export const POST = route(null, async ({ scope, permissions }, req) => {
  if (!["dashboard:view", "sales:view", "sellout:view"].some((p) => permissions.includes(p))) throw new HttpError(403, "Forbidden");
  const { filters, compare } = body.parse(await req.json());
  const a = buildAnalytics(scope, filters, compare);
  // Without sell-out access, strip sell-out figures from the payload.
  if (!permissions.includes("sellout:view") && !permissions.includes("dashboard:view")) {
    return { ...a, sellout: null, monthlySales: a.monthlySales.map((m) => ({ ...m, sellout: 0, sellOutUnits: 0 })) };
  }
  return a;
});
