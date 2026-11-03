import { route, HttpError } from "@/lib/guard";
import { audit, db, notify, roleOf } from "@/lib/store";
import { z } from "zod";

const scope = z.object({ countries: z.array(z.string()), customers: z.array(z.string()), brands: z.array(z.string()), categories: z.array(z.string()), reps: z.array(z.string()) });
const patch = z.object({ roleId: z.string().optional(), status: z.enum(["active", "inactive"]).optional(), scope: scope.optional(), country: z.string().max(3).optional(), department: z.string().max(100).optional(), jobTitle: z.string().max(100).optional() });

export const PATCH = route("users:edit", async ({ user, permissions }, req, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const t = db().users.find((u) => u.id === id);
  if (!t) throw new HttpError(404, "User not found");
  const b = patch.parse(await req.json());
  if (t.roleId === "super_admin" && user.roleId !== "super_admin") throw new HttpError(403, "Only a Super Administrator can modify a Super Administrator");
  if ((b.roleId || b.scope) && !permissions.includes("users:manage_permissions")) throw new HttpError(403, "Forbidden: missing permission users:manage_permissions");
  if (b.status && !permissions.includes("users:manage_users")) throw new HttpError(403, "Forbidden: missing permission users:manage_users");
  if (b.status === "inactive" && t.id === user.id) throw new HttpError(400, "You cannot deactivate your own account");
  if (b.roleId) {
    if (!db().roles.some((r) => r.id === b.roleId)) throw new HttpError(400, "Unknown role");
    if (b.roleId === "super_admin" && user.roleId !== "super_admin") throw new HttpError(403, "Only a Super Administrator can assign that role");
    if (t.id === user.id) throw new HttpError(400, "You cannot change your own role");
    const was = roleOf(t)?.name; t.roleId = b.roleId;
    audit(user, "permission.role_change", t.email, `${was} -> ${roleOf(t)?.name}`);
    notify({ userId: t.id, type: "permissions", title: "Your role changed", body: `Your role is now ${roleOf(t)?.name}.`, severity: "info" });
  }
  if (b.scope) { audit(user, "permission.scope_change", t.email, JSON.stringify(b.scope)); t.scope = b.scope; }
  if (b.status && b.status !== t.status) {
    t.status = b.status; audit(user, b.status === "inactive" ? "user.deactivate" : "user.reactivate", t.email);
    notify({ userId: "all", type: "system", title: b.status === "inactive" ? "User deactivated" : "User reactivated", body: t.name, severity: "info" });
  }
  for (const k of ["country", "department", "jobTitle"] as const) if (b[k] !== undefined) t[k] = b[k]!;
  return { ok: true };
});
