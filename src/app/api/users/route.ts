import { route, HttpError } from "@/lib/guard";
import { audit, db, nextId, notify, roleOf } from "@/lib/store";
import { z } from "zod";

export const GET = route("users:view", async ({ permissions }) => ({
  canManage: permissions.includes("users:manage_users"),
  canPermissions: permissions.includes("users:manage_permissions"),
  users: db().users.map((u) => ({ id: u.id, name: u.name, email: u.email, roleId: u.roleId, role: roleOf(u)?.name, country: u.country, department: u.department, jobTitle: u.jobTitle, status: u.status, lastLogin: u.lastLogin, scope: u.scope, permissionCount: roleOf(u)?.permissions.length ?? 0, demo: !!u.demo })),
}));

const scope = z.object({ countries: z.array(z.string()).default([]), customers: z.array(z.string()).default([]), brands: z.array(z.string()).default([]), categories: z.array(z.string()).default([]), reps: z.array(z.string()).default([]) });
const invite = z.object({ name: z.string().min(2).max(100), email: z.string().email().max(200), roleId: z.string(), country: z.string().max(3).default(""), department: z.string().max(100).default(""), jobTitle: z.string().max(100).default(""), scope: scope.default({ countries: [], customers: [], brands: [], categories: [], reps: [] }) });

export const POST = route(["users:create", "users:manage_users"], async ({ user }, req) => {
  const b = invite.parse(await req.json());
  if (!db().roles.some((r) => r.id === b.roleId)) throw new HttpError(400, "Unknown role");
  if (b.roleId === "super_admin" && user.roleId !== "super_admin") throw new HttpError(403, "Only a Super Administrator can invite another Super Administrator");
  if (db().users.some((u) => u.email.toLowerCase() === b.email.toLowerCase())) throw new HttpError(409, "A user with this email already exists");
  const u = { id: nextId("u"), ...b, status: "invited" as const, lastLogin: null, language: "en", notifyPrefs: { invitations: true, permissions: true, imports: true, targets: true, variations: true, quality: true, system: true } };
  db().users.push(u);
  audit(user, "user.invite", b.email, `role=${b.roleId}`);
  notify({ userId: "all", type: "invitation", title: "New user invitation", body: `${b.name} (${b.email}) was invited as ${roleOf(u)?.name}.`, severity: "info" });
  return { ok: true, id: u.id, note: "The user is provisioned. They can sign in with their Microsoft 365 account; no invitation email is sent by this demo." };
});
